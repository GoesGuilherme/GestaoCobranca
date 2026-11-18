import { dentroDaJanela, fimDaJanela } from "@/lib/assessor-escopo";
import {
  JANELA_LIMITE_IA_MS,
  PAUSA_ATENDIMENTO_IA_MS,
  TEXTO_FALHA_IA,
  type ConfiguracaoAtendimentoIaDTO,
  type TrabalhoAtendimentoIa,
  limiteConversaAtendimentoIa,
  maxTokensAtendimentoIa,
  montarTextoClienteIa,
  promptAtendimentoIa,
  textoSeguroIa,
  timeoutAtendimentoIa,
} from "@/lib/atendimento-ia";
import { chaveTelefone } from "@/lib/mensagens-twilio";
import { digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import { esquemaAtendimentoIa } from "@/lib/validacao";
import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { provedorAtendimentoPadrao } from "@/server/atendimento-ia/fabrica";
import { criarFerramentasAtendimento } from "@/server/atendimento-ia/ferramentas";
import type { ProvedorAtendimentoIa } from "@/server/atendimento-ia/provedor";
import { ErroTwilio, type ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { lerEsquema } from "@/server/validar";
import { canalRespostaWhatsapp } from "./mensagens-service";

type Ambiente = NodeJS.ProcessEnv;

const VAZIO: ConfiguracaoAtendimentoIaDTO = { ativo: false, instrucoes: "", textoRepasse: "" };

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function erroSeguro(erro: unknown, env: Ambiente) {
  const bruto = erro instanceof Error ? erro.name : "falha";
  const segredos = [env.AI_GATEWAY_API_KEY, env.VERCEL_OIDC_TOKEN, env.TWILIO_AUTH_TOKEN].filter(
    (item): item is string => Boolean(item && item.length >= 6),
  );
  let texto = bruto;
  for (const segredo of segredos) texto = texto.split(segredo).join("[redigido]");
  return texto.slice(0, 120);
}

function formasDe(telefone: string): string[] {
  return [`whatsapp:+${telefone}`, `+${telefone}`, telefone];
}

function nacionalDe(telefone: string): string {
  return telefone.startsWith("55") && telefone.length > 11 ? telefone.slice(2) : telefone;
}

function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout_atendimento_ia")), ms);
    promessa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      },
    );
  });
}

type Cadastro = { id: string; nomeFantasia: string };

async function clientesDoTelefone(empresaId: string, telefone: string): Promise<Cadastro[]> {
  const formas = [...new Set([telefone, nacionalDe(telefone)])];
  const clientes = await prisma.cliente.findMany({
    where: { empresaId, whatsapp: { in: formas } },
    select: { id: true, nomeFantasia: true },
  });
  const filiais = await prisma.filial.findMany({
    where: { whatsapp: { in: formas }, cliente: { empresaId } },
    select: { cliente: { select: { id: true, nomeFantasia: true } } },
  });
  const mapa = new Map<string, Cadastro>();
  for (const cliente of clientes) mapa.set(cliente.id, cliente);
  for (const filial of filiais) mapa.set(filial.cliente.id, filial.cliente);
  return [...mapa.values()];
}

export async function obterAtendimentoIa(empresaId: string): Promise<ConfiguracaoAtendimentoIaDTO> {
  const linha = await prisma.configuracaoAtendimentoIa.findUnique({ where: { empresaId } });
  if (!linha) return VAZIO;
  return {
    ativo: linha.ativo,
    instrucoes: linha.instrucoes ?? "",
    textoRepasse: linha.textoRepasse ?? "",
  };
}

export async function salvarAtendimentoIa(acesso: Acesso, entrada: unknown): Promise<ConfiguracaoAtendimentoIaDTO> {
  exigirDono(acesso);
  const dados = lerEsquema(esquemaAtendimentoIa, entrada);
  const linha = await prisma.configuracaoAtendimentoIa.upsert({
    where: { empresaId: acesso.empresaId },
    create: {
      empresaId: acesso.empresaId,
      ativo: dados.ativo,
      instrucoes: dados.instrucoes || null,
      textoRepasse: dados.textoRepasse || null,
    },
    update: {
      ativo: dados.ativo,
      instrucoes: dados.instrucoes || null,
      textoRepasse: dados.textoRepasse || null,
    },
  });
  return {
    ativo: linha.ativo,
    instrucoes: linha.instrucoes ?? "",
    textoRepasse: linha.textoRepasse ?? "",
  };
}

async function reservar(empresaId: string, messageSid: string): Promise<boolean> {
  try {
    await prisma.entradaAtendimentoIa.create({ data: { empresaId, messageSid } });
    return true;
  } catch (erro) {
    if (conflito(erro)) return false;
    throw erro;
  }
}

async function historico(empresaId: string, telefone: string, corpoAtual: string) {
  const [entradas, respostas] = await Promise.all([
    prisma.eventoWhatsapp.findMany({
      where: { empresaId, tipo: "INBOUND", de: { in: formasDe(telefone) } },
      orderBy: { recebidoEm: "desc" },
      take: 6,
      select: { corpo: true, recebidoEm: true },
    }),
    prisma.respostaWhatsapp.findMany({
      where: { empresaId, telefone },
      orderBy: { criadoEm: "desc" },
      take: 6,
      select: { corpo: true, criadoEm: true },
    }),
  ]);
  const itens = [
    ...entradas.map((entrada) => ({
      papel: "user" as const,
      texto: (entrada.corpo ?? "").slice(0, 500),
      quando: entrada.recebidoEm.getTime(),
    })),
    ...respostas.map((resposta) => ({
      papel: "assistant" as const,
      texto: resposta.corpo.slice(0, 500),
      quando: resposta.criadoEm.getTime(),
    })),
  ]
    .filter((item) => item.texto.trim())
    .sort((a, b) => a.quando - b.quando)
    .slice(-6);
  if (itens.at(-1)?.papel === "user" && itens.at(-1)?.texto.trim() === corpoAtual.trim()) itens.pop();
  return itens.map(({ papel, texto }) => ({ papel, texto }));
}

// O pool na Vercel é 1. Esta função não abre transação.
// A consulta ao modelo e o envio pela Twilio ficam soltos, cada um na sua vez.
export async function executarAtendimentoIa(
  trabalho: TrabalhoAtendimentoIa,
  opcoes: { twilio?: ClienteTwilio; provedor?: ProvedorAtendimentoIa; env?: Ambiente; agora?: Date } = {},
) {
  const env = opcoes.env ?? process.env;
  const agora = opcoes.agora ?? new Date();
  const messageSid = trabalho.messageSid.trim().slice(0, 64);
  const telefone = chaveTelefone(trabalho.de) ?? digitosWhatsapp(trabalho.de.replace(/^whatsapp:/i, ""));
  const corpo = trabalho.corpo.replace(/[ \t]+/g, " ").trim().slice(0, 1000);
  if (!messageSid || !telefone || !corpo) return { situacao: "invalido" as const };

  const config = await prisma.configuracaoAtendimentoIa.findUnique({ where: { empresaId: trabalho.empresaId } });
  if (!config?.ativo) return { situacao: "desligado" as const };
  if (!(await reservar(trabalho.empresaId, messageSid))) return { situacao: "duplicado" as const };

  const opt = await prisma.optOutWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId: trabalho.empresaId, telefone } },
    select: { ativo: true },
  });
  if (opt?.ativo) return { situacao: "opt_out" as const };

  const recebidoEm = new Date(trabalho.recebidoEm);
  const recebido = Number.isNaN(recebidoEm.getTime()) ? agora : recebidoEm;
  if (!dentroDaJanela(fimDaJanela(recebido), agora)) return { situacao: "janela" as const };

  const empresa = await prisma.empresa.findUnique({
    where: { id: trabalho.empresaId },
    select: { nomeFantasia: true, prazoMaximoPromessaDias: true },
  });
  const nomeEmpresa = empresa?.nomeFantasia ?? "sua empresa";
  const prazo = empresa?.prazoMaximoPromessaDias || 15;
  const conversa = await prisma.conversaAtendimentoIa.upsert({
    where: { empresaId_telefone: { empresaId: trabalho.empresaId, telefone } },
    create: { empresaId: trabalho.empresaId, telefone },
    update: {},
  });
  if (conversa.pausadaAte && conversa.pausadaAte.getTime() > agora.getTime()) {
    return { situacao: "pausado" as const };
  }

  const desde = new Date(agora.getTime() - JANELA_LIMITE_IA_MS);
  const recentes = await prisma.respostaWhatsapp.count({
    where: { empresaId: trabalho.empresaId, telefone, origem: "IA", criadoEm: { gte: desde } },
  });
  if (recentes >= limiteConversaAtendimentoIa(env)) return { situacao: "limite" as const };

  const clientes = await clientesDoTelefone(trabalho.empresaId, telefone);
  if (clientes.length !== 1) {
    const semCadastro = clientes.length === 0;
    const contato = (config.textoRepasse ?? "").replace(/\s+/g, " ").trim();
    const base = semCadastro
      ? `Não encontrei este número no cadastro da ${nomeEmpresa}. Vou pedir para uma pessoa continuar o atendimento.`
      : `Encontrei mais de um cadastro para este número na ${nomeEmpresa}. Para não misturar faturas, vou pedir para uma pessoa continuar.`;
    await prisma.conversaAtendimentoIa.updateMany({
      where: { id: conversa.id, empresaId: trabalho.empresaId },
      data: {
        precisaAtencao: true,
        pausadaAte: new Date(agora.getTime() + PAUSA_ATENDIMENTO_IA_MS),
        motivoAtencao: semCadastro ? "Sem cadastro" : "Cadastro ambíguo",
        clienteId: null,
      },
    });
    const enviou = await enviarResposta({
      empresaId: trabalho.empresaId,
      telefone,
      clienteId: null,
      para: trabalho.para,
      nomeEmpresa,
      jaDivulgou: conversa.divulgouAssistente,
      texto: contato ? `${base} ${contato}` : base,
      ids: [],
      env,
      twilio: opcoes.twilio,
    });
    return { situacao: enviou ? (semCadastro ? "sem_cliente" : "ambiguo") : "sem_canal" } as const;
  }

  const cliente = clientes[0];
  if (!cliente) return { situacao: "sem_cliente" as const };
  await prisma.conversaAtendimentoIa.updateMany({
    where: { id: conversa.id, empresaId: trabalho.empresaId },
    data: { clienteId: cliente.id },
  });
  const ferramentas = criarFerramentasAtendimento({
    empresaId: trabalho.empresaId,
    clienteId: cliente.id,
    conversaId: conversa.id,
    nomeEmpresa,
    textoRepasse: config.textoRepasse ?? "",
    agora,
  });
  const provedor = opcoes.provedor ?? provedorAtendimentoPadrao(env);
  let textoModelo = TEXTO_FALHA_IA;
  let saidas: { texto: string; ids?: string[] }[] = [];
  try {
    const gerado = await comTimeout(
      provedor.gerar({
        sistema: promptAtendimentoIa({
          nomeEmpresa,
          nomeCliente: cliente.nomeFantasia,
          tom: config.instrucoes ?? "",
          prazoDias: prazo,
          textoRepasse: config.textoRepasse ?? "",
        }),
        historico: await historico(trabalho.empresaId, telefone, corpo),
        textoUsuario: corpo,
        ferramentas,
        maxTokens: maxTokensAtendimentoIa(env),
        timeoutMs: timeoutAtendimentoIa(env),
      }),
      timeoutAtendimentoIa(env) + 500,
    );
    saidas = gerado.saidas;
    textoModelo = textoSeguroIa(
      gerado.texto,
      gerado.saidas.map((saida) => saida.texto),
    );
  } catch (erro) {
    console.error("atendimento_ia", erroSeguro(erro, env));
  }
  const ids = saidas.flatMap((saida) => saida.ids ?? []);
  const enviou = await enviarResposta({
    empresaId: trabalho.empresaId,
    telefone,
    clienteId: cliente.id,
    para: trabalho.para,
    nomeEmpresa,
    jaDivulgou: conversa.divulgouAssistente,
    texto: textoModelo || TEXTO_FALHA_IA,
    ids,
    env,
    twilio: opcoes.twilio,
  });
  return { situacao: enviou ? "enviado" : "sem_canal" } as const;
}

async function enviarResposta(dados: {
  empresaId: string;
  telefone: string;
  clienteId: string | null;
  para: string | null;
  nomeEmpresa: string;
  jaDivulgou: boolean;
  texto: string;
  ids: string[];
  env: Ambiente;
  twilio?: ClienteTwilio;
}): Promise<boolean> {
  const corpo = montarTextoClienteIa(dados.nomeEmpresa, dados.jaDivulgou, dados.texto, dados.ids).slice(0, 1000);
  if (!corpo.trim()) return false;
  let canal: Awaited<ReturnType<typeof canalRespostaWhatsapp>>;
  try {
    canal = await canalRespostaWhatsapp(dados.empresaId, dados.para, dados.env);
  } catch (erro) {
    console.error("atendimento_ia_canal", erroSeguro(erro, dados.env));
    return false;
  }
  const twilio = dados.twilio ?? clienteTwilioPadrao(dados.env);
  let sid = "";
  try {
    const enviada = await twilio.enviarTexto(canal.conta, {
      de: canal.de,
      para: `whatsapp:+${dados.telefone}`,
      corpo,
      statusCallback: canal.statusCallback,
    });
    sid = enviada.sid;
  } catch (erro) {
    if (erro instanceof ErroTwilio) {
      console.error("atendimento_ia_envio", "ErroTwilio");
      return false;
    }
    console.error("atendimento_ia_envio", erroSeguro(erro, dados.env));
    return false;
  }
  try {
    await prisma.respostaWhatsapp.create({
      data: {
        empresaId: dados.empresaId,
        telefone: dados.telefone,
        clienteId: dados.clienteId,
        usuarioId: null,
        corpo,
        messageSid: sid,
        origem: "IA",
      },
    });
  } catch (erro) {
    if (!conflito(erro)) throw erro;
  }
  await prisma.conversaAtendimentoIa.updateMany({
    where: { empresaId: dados.empresaId, telefone: dados.telefone },
    data: { divulgouAssistente: true },
  });
  return true;
}
