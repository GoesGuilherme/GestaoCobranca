import { decisaoOptOut, digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import {
  classificarAssunto,
  dentroDaJanela,
  dentroDoHorario,
  extrairDocumento,
  fimDaJanela,
  inicioDaJanelaDeLimite,
  inicioDoDia,
  inteiroDeAmbiente,
  promptFixoDoAssessor,
} from "@/lib/assessor-escopo";
import {
  TEXTO_FALLBACK,
  TEXTO_LIMITE,
  TEXTO_TETO,
  textoCumprimento,
  textoDocumentoAmbiguo,
  textoDocumentoInvalido,
  textoForaDoHorario,
  textoHumano,
  textoIdentificado,
  textoPedirDocumento,
  textoRecusa,
  textoRetomada,
  textoTecnico,
} from "@/lib/assessor-mensagens";
import { formatarWhatsapp } from "@/lib/documento";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirAssessor, exigirVerAssessor } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { esquemaAssessor, esquemaRespostaAssessor } from "@/lib/validacao";
import { provedorAssessorPadrao } from "@/server/assessor/fabrica";
import { criarFerramentasAssessor } from "@/server/assessor/ferramentas";
import type { ProvedorAssessor } from "@/server/assessor/provedor";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao, numeroTesteWhatsapp } from "@/server/twilio/fabrica";
import { lerEsquema } from "@/server/validar";
import type { ConfiguracaoAssessorDTO, ConversaAssessorDTO, ConversaAssessorDetalhe } from "@/lib/tipos";

type Ambiente = NodeJS.ProcessEnv;

const VAZIO: ConfiguracaoAssessorDTO = {
  gravada: false,
  ativo: false,
  modoTeste: true,
  nome: "Assessor",
  tom: "cordial, claro e breve",
  promptExtra: "",
  horaInicio: 8,
  horaFim: 18,
  atendeFimDeSemana: false,
};

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout_assessor")), ms);
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

function erroSeguro(erro: unknown, env: Ambiente) {
  const bruto = erro instanceof Error ? `${erro.name}` : "falha";
  const segredos = [env.AI_GATEWAY_API_KEY, env.VERCEL_OIDC_TOKEN, env.TWILIO_AUTH_TOKEN].filter(
    (item): item is string => Boolean(item && item.length >= 6),
  );
  let texto = bruto;
  for (const segredo of segredos) texto = texto.split(segredo).join("[redigido]");
  return texto.slice(0, 120);
}

function telefoneExibicao(digitos: string) {
  const nacional = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  return formatarWhatsapp(nacional);
}

function limites(env: Ambiente) {
  return {
    telefone: inteiroDeAmbiente(env, "ASSESSOR_LIMITE_TELEFONE", 8, 1, 100),
    empresa: inteiroDeAmbiente(env, "ASSESSOR_LIMITE_EMPRESA", 60, 1, 1000),
    tetoResposta: inteiroDeAmbiente(env, "ASSESSOR_TETO_TOKENS", 600, 64, 4000),
    tetoDia: inteiroDeAmbiente(env, "ASSESSOR_TETO_TOKENS_DIA", 100000, 1, 5_000_000),
    timeoutMs: inteiroDeAmbiente(env, "ASSESSOR_TIMEOUT_MS", 12000, 20, 30000),
  };
}

function numeroTeste(env: Ambiente) {
  return digitosWhatsapp(numeroTesteWhatsapp(env) ?? "");
}

async function consumirLimite(empresaId: string, chave: string, agora: Date, maximo: number) {
  const janelaInicio = inicioDaJanelaDeLimite(agora);
  const linha = await prisma.limiteAssessor.upsert({
    where: { empresaId_chave_janelaInicio: { empresaId, chave, janelaInicio } },
    create: { empresaId, chave, janelaInicio, quantidade: 1 },
    update: { quantidade: { increment: 1 } },
  });
  return linha.quantidade <= maximo;
}

async function tokensDoDia(empresaId: string, agora: Date) {
  const soma = await prisma.mensagemAssessor.aggregate({
    where: { empresaId, papel: "ASSESSOR", criadoEm: { gte: inicioDoDia(agora) } },
    _sum: { tokens: true },
  });
  return soma._sum.tokens ?? 0;
}

type Cadastro = { id: string; nomeFantasia: string };

async function porTelefone(empresaId: string, telefone: string): Promise<Cadastro[]> {
  const nacional = telefone.startsWith("55") ? telefone.slice(2) : telefone;
  const clientes = await prisma.cliente.findMany({
    where: { empresaId, whatsapp: nacional },
    select: { id: true, nomeFantasia: true },
  });
  const filiais = await prisma.filial.findMany({
    where: { whatsapp: nacional, cliente: { empresaId } },
    select: { cliente: { select: { id: true, nomeFantasia: true } } },
  });
  const mapa = new Map<string, Cadastro>();
  for (const cliente of clientes) mapa.set(cliente.id, cliente);
  for (const filial of filiais) mapa.set(filial.cliente.id, filial.cliente);
  return [...mapa.values()];
}

async function porDocumento(empresaId: string, documento: string, apenas?: string[]): Promise<Cadastro[]> {
  if (apenas && apenas.length === 0) return [];
  return prisma.cliente.findMany({
    where: {
      empresaId,
      ...(apenas ? { id: { in: apenas } } : {}),
      OR: [{ documento }, { filiais: { some: { cnpj: documento } } }],
    },
    select: { id: true, nomeFantasia: true },
  });
}

export async function processarEntradaAssessor(
  entrada: { empresaId: string; messageSid: string; de: string; corpo: string; recebidoEm?: Date },
  opcoes: { agora?: Date; twilio?: ClienteTwilio; provedor?: ProvedorAssessor; env?: Ambiente } = {},
) {
  const env = opcoes.env ?? process.env;
  const messageSid = entrada.messageSid.trim().slice(0, 64);
  const corpo = entrada.corpo.replace(/\s+/g, " ").trim().slice(0, 1000);
  const telefone = digitosWhatsapp(entrada.de.replace(/^whatsapp:/i, ""));
  if (!messageSid || !telefone) return { situacao: "telefone_invalido" as const };

  const config = await prisma.configuracaoAssessor.findUnique({ where: { empresaId: entrada.empresaId } });
  if (!config || !config.ativo) return { situacao: "desligado" as const };
  const modoTeste = config.modoTeste;
  if (modoTeste && numeroTeste(env) !== telefone) return { situacao: "modo_teste" as const };

  const ja = await prisma.mensagemAssessor.findFirst({
    where: { empresaId: entrada.empresaId, messageSid },
    select: { id: true },
  });
  if (ja) return { situacao: "duplicado" as const };

  const agora = opcoes.agora ?? new Date();
  const recebidoEm = entrada.recebidoEm ?? agora;
  const janelaAte = fimDaJanela(recebidoEm);
  const empresa = await prisma.empresa.findUnique({
    where: { id: entrada.empresaId },
    select: { nomeFantasia: true },
  });
  const nomeEmpresa = empresa?.nomeFantasia ?? "sua empresa";
  const conversa = await prisma.conversaAssessor.upsert({
    where: { empresaId_telefone: { empresaId: entrada.empresaId, telefone } },
    create: {
      empresaId: entrada.empresaId,
      telefone,
      janelaAte,
      ultimaEntradaEm: recebidoEm,
    },
    update: { janelaAte, ultimaEntradaEm: recebidoEm },
  });

  let mensagemClienteId = "";
  try {
    const gravada = await prisma.mensagemAssessor.create({
      data: {
        empresaId: entrada.empresaId,
        conversaId: conversa.id,
        papel: "CLIENTE",
        corpo: corpo || "(sem texto)",
        messageSid,
      },
    });
    mensagemClienteId = gravada.id;
  } catch (erro) {
    if (conflito(erro)) return { situacao: "duplicado" as const };
    throw erro;
  }

  const opt = await prisma.optOutWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId: entrada.empresaId, telefone } },
  });
  if (opt?.ativo) return { situacao: "opt_out" as const };

  async function anotar(texto: string) {
    await prisma.mensagemAssessor.create({
      data: { empresaId: entrada.empresaId, conversaId: conversa.id, papel: "SISTEMA", corpo: texto.slice(0, 1500) },
    });
  }

  async function enviar(texto: string, papel: "ASSESSOR" | "HUMANO", tokens = 0) {
    if (!dentroDaJanela(janelaAte, agora)) {
      await anotar("Fora da janela de 24h. Não enviei texto livre.");
      return false;
    }
    const limpo = texto.replace(/\s+\n/g, "\n").trim().slice(0, 1500);
    if (!limpo) return false;
    const twilioConfig = await prisma.configuracaoTwilio.findUnique({ where: { empresaId: entrada.empresaId } });
    if (!twilioConfig?.senderTelefone || twilioConfig.senderStatus !== "ONLINE") {
      await anotar("Não enviei a resposta: o WhatsApp da empresa não está online.");
      return false;
    }
    const destino = modoTeste ? numeroTeste(env) : telefone;
    if (!destino || (modoTeste && destino !== telefone)) {
      await anotar("Não enviei a resposta: o modo teste só fala com TWILIO_WHATSAPP_TESTE.");
      return false;
    }
    const para = `whatsapp:+${destino}`;
    const de = twilioConfig.senderTelefone.startsWith("+")
      ? `whatsapp:${twilioConfig.senderTelefone}`
      : `whatsapp:+${twilioConfig.senderTelefone}`;
    try {
      const conta = {
        accountSid: twilioConfig.subaccountSid,
        authToken: decifrarSegredoAsaas(twilioConfig.authTokenCifrado),
      };
      const twilio = opcoes.twilio ?? clienteTwilioPadrao(env);
      const enviada = await twilio.enviarTexto(conta, {
        de,
        para,
        corpo: limpo,
        statusCallback: twilioConfig.webhookUrl,
      });
      await prisma.mensagemAssessor.create({
        data: {
          empresaId: entrada.empresaId,
          conversaId: conversa.id,
          papel,
          corpo: limpo,
          messageSid: enviada.sid,
          tokens,
        },
      });
      return true;
    } catch (erro) {
      console.error("assessor_envio", erroSeguro(erro, env));
      await anotar("Não enviei a resposta: a Twilio não aceitou o texto.");
      return false;
    }
  }

  if (!dentroDaJanela(janelaAte, agora)) {
    await anotar("Mensagem recebida fora da janela de 24h. Não enviei texto livre.");
    return { situacao: "janela" as const };
  }
  if (conversa.iaPausada) return { situacao: "pausada" as const };

  const cota = limites(env);
  const cabeTelefone = await consumirLimite(entrada.empresaId, `tel:${telefone}`, agora, cota.telefone);
  const cabeEmpresa = await consumirLimite(entrada.empresaId, "empresa", agora, cota.empresa);
  if (!cabeTelefone || !cabeEmpresa) {
    await enviar(TEXTO_LIMITE, "ASSESSOR");
    return { situacao: "limite" as const };
  }
  if (!dentroDoHorario(agora, config)) {
    await enviar(textoForaDoHorario({ nomeEmpresa, horaInicio: config.horaInicio, horaFim: config.horaFim }), "ASSESSOR");
    return { situacao: "horario" as const };
  }
  if ((await tokensDoDia(entrada.empresaId, agora)) >= cota.tetoDia) {
    await enviar(TEXTO_TETO, "ASSESSOR");
    return { situacao: "teto" as const };
  }
  if (decisaoOptOut({ corpo, optOutType: "" }) === "RETOMAR") {
    await enviar(textoRetomada(nomeEmpresa), "ASSESSOR");
    return { situacao: "respondido" as const };
  }

  async function ligar(cadastro: Cadastro) {
    await prisma.conversaAssessor.updateMany({
      where: { id: conversa.id, empresaId: entrada.empresaId },
      data: { clienteId: cadastro.id, aguardandoDocumento: false },
    });
    return cadastro;
  }

  async function encaminhar(motivo: "TECNICO" | "PEDIDO" | "FORA_ESCOPO", clienteId: string | null) {
    await prisma.pedidoAtendimento.create({
      data: {
        empresaId: entrada.empresaId,
        conversaId: conversa.id,
        clienteId,
        motivo,
        resumo: (corpo || "Pedido de atendimento humano.").slice(0, 500),
        status: "ABERTO",
      },
    });
    await prisma.conversaAssessor.updateMany({
      where: { id: conversa.id, empresaId: entrada.empresaId },
      data: { iaPausada: true },
    });
    const texto = motivo === "TECNICO" ? textoTecnico(nomeEmpresa) : motivo === "FORA_ESCOPO" ? textoDocumentoAmbiguo(nomeEmpresa) : textoHumano(nomeEmpresa);
    await enviar(texto, "ASSESSOR");
  }

  let clienteId = conversa.clienteId;
  let nomeCliente: string | null = null;
  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId: entrada.empresaId },
      select: { id: true, nomeFantasia: true },
    });
    if (!cliente) clienteId = null;
    else nomeCliente = cliente.nomeFantasia;
  }

  const documento = extrairDocumento(corpo);
  if (!clienteId) {
    const doTelefone = await porTelefone(entrada.empresaId, telefone);
    if (doTelefone.length === 1 && !documento) {
      const ligado = await ligar(doTelefone[0]);
      clienteId = ligado.id;
      nomeCliente = ligado.nomeFantasia;
    } else if (doTelefone.length === 1 && documento) {
      const confirmado = await porDocumento(entrada.empresaId, documento.normalizado, [doTelefone[0].id]);
      if (confirmado.length === 1) {
        const ligado = await ligar(confirmado[0]);
        clienteId = ligado.id;
        nomeCliente = ligado.nomeFantasia;
      }
    } else if (doTelefone.length > 1) {
      const restritos = documento
        ? await porDocumento(entrada.empresaId, documento.normalizado, doTelefone.map((item) => item.id))
        : [];
      if (restritos.length === 1) {
        const ligado = await ligar(restritos[0]);
        clienteId = ligado.id;
        nomeCliente = ligado.nomeFantasia;
      } else if (!documento) {
        await prisma.conversaAssessor.updateMany({
          where: { id: conversa.id, empresaId: entrada.empresaId },
          data: { aguardandoDocumento: true },
        });
        await enviar(textoPedirDocumento(nomeEmpresa), "ASSESSOR");
        return { situacao: "respondido" as const };
      } else {
        await encaminhar("FORA_ESCOPO", null);
        return { situacao: "respondido" as const };
      }
    } else if (documento) {
      const achados = await porDocumento(entrada.empresaId, documento.normalizado);
      if (achados.length === 1) {
        const ligado = await ligar(achados[0]);
        clienteId = ligado.id;
        nomeCliente = ligado.nomeFantasia;
      } else if (achados.length === 0) {
        await prisma.conversaAssessor.updateMany({
          where: { id: conversa.id, empresaId: entrada.empresaId },
          data: { aguardandoDocumento: true },
        });
        await enviar(textoDocumentoInvalido(nomeEmpresa), "ASSESSOR");
        return { situacao: "respondido" as const };
      } else {
        await encaminhar("FORA_ESCOPO", null);
        return { situacao: "respondido" as const };
      }
    }
  }

  const assunto = classificarAssunto(corpo);
  if (!clienteId) {
    if (assunto === "FORA") {
      await enviar(textoRecusa(nomeEmpresa), "ASSESSOR");
      return { situacao: "respondido" as const };
    }
    if (assunto === "TECNICO") {
      await encaminhar("TECNICO", null);
      return { situacao: "respondido" as const };
    }
    if (assunto === "HUMANO") {
      await encaminhar("PEDIDO", null);
      return { situacao: "respondido" as const };
    }
    await prisma.conversaAssessor.updateMany({
      where: { id: conversa.id, empresaId: entrada.empresaId },
      data: { aguardandoDocumento: true },
    });
    await enviar(
      assunto === "CUMPRIMENTO" ? textoCumprimento({ nomeAssessor: config.nome, nomeEmpresa, nomeCliente: null }) : textoPedirDocumento(nomeEmpresa),
      "ASSESSOR",
    );
    return { situacao: "respondido" as const };
  }

  if (documento && assunto !== "COBRANCA" && assunto !== "TECNICO" && assunto !== "HUMANO") {
    const resto = corpo.replace(documento.normalizado, "").replace(/\d/g, "").trim();
    if (!resto || classificarAssunto(resto) === "CUMPRIMENTO" || classificarAssunto(corpo) === "FORA") {
      await enviar(textoIdentificado(nomeCliente ?? "cliente", nomeEmpresa), "ASSESSOR");
      return { situacao: "respondido" as const };
    }
  }

  if (assunto === "FORA") {
    await enviar(textoRecusa(nomeEmpresa), "ASSESSOR");
    return { situacao: "respondido" as const };
  }
  if (assunto === "TECNICO") {
    await encaminhar("TECNICO", clienteId);
    return { situacao: "respondido" as const };
  }
  if (assunto === "HUMANO") {
    await encaminhar("PEDIDO", clienteId);
    return { situacao: "respondido" as const };
  }
  if (assunto === "CUMPRIMENTO") {
    await enviar(textoCumprimento({ nomeAssessor: config.nome, nomeEmpresa, nomeCliente }), "ASSESSOR");
    return { situacao: "respondido" as const };
  }

  const anteriores = await prisma.mensagemAssessor.findMany({
    where: {
      empresaId: entrada.empresaId,
      conversaId: conversa.id,
      id: { not: mensagemClienteId },
      papel: { in: ["CLIENTE", "ASSESSOR", "HUMANO"] },
    },
    orderBy: { criadoEm: "desc" },
    take: 8,
  });
  const historico = anteriores.reverse().map((mensagem) => ({
    papel: mensagem.papel === "CLIENTE" ? ("user" as const) : ("assistant" as const),
    texto: mensagem.corpo.slice(0, 500),
  }));
  const ferramentas = criarFerramentasAssessor({
    empresaId: entrada.empresaId,
    clienteId,
    nomeEmpresa,
    conversaId: conversa.id,
  });
  const provedor = opcoes.provedor ?? provedorAssessorPadrao(env);
  try {
    const saida = await comTimeout(
      provedor.gerar({
        sistema: promptFixoDoAssessor({
          nomeEmpresa,
          nomeAssessor: config.nome,
          tom: config.tom,
          horaInicio: config.horaInicio,
          horaFim: config.horaFim,
          atendeFimDeSemana: config.atendeFimDeSemana,
          promptExtra: config.promptExtra,
          nomeCliente: nomeCliente ?? "cliente",
        }),
        historico,
        textoUsuario: corpo,
        ferramentas,
        maxTokens: cota.tetoResposta,
        timeoutMs: cota.timeoutMs,
      }),
      cota.timeoutMs,
    );
    const enviou = await enviar(saida.texto || TEXTO_FALLBACK, "ASSESSOR", saida.tokens);
    return { situacao: enviou ? ("respondido" as const) : ("sem_envio" as const) };
  } catch (erro) {
    console.error("assessor_ia", erroSeguro(erro, env));
    await enviar(TEXTO_FALLBACK, "ASSESSOR");
    return { situacao: "respondido" as const };
  }
}

function paraConfig(linha: {
  ativo: boolean;
  modoTeste: boolean;
  nome: string;
  tom: string;
  promptExtra: string | null;
  horaInicio: number;
  horaFim: number;
  atendeFimDeSemana: boolean;
} | null): ConfiguracaoAssessorDTO {
  if (!linha) return VAZIO;
  return {
    gravada: true,
    ativo: linha.ativo,
    modoTeste: linha.modoTeste,
    nome: linha.nome,
    tom: linha.tom,
    promptExtra: linha.promptExtra ?? "",
    horaInicio: linha.horaInicio,
    horaFim: linha.horaFim,
    atendeFimDeSemana: linha.atendeFimDeSemana,
  };
}

export async function obterAssessorDoPainel(autor: AutorEmpresa) {
  exigirVerAssessor(autor);
  const [config, conversas] = await Promise.all([
    prisma.configuracaoAssessor.findUnique({ where: { empresaId: autor.empresaId } }),
    listarConversas(autor),
  ]);
  return { config: paraConfig(config), conversas };
}

export async function salvarAssessor(autor: AutorEmpresa, entrada: unknown) {
  exigirAssessor(autor);
  const dados = lerEsquema(esquemaAssessor, entrada);
  const gravada = await prisma.configuracaoAssessor.upsert({
    where: { empresaId: autor.empresaId },
    create: {
      empresaId: autor.empresaId,
      ativo: dados.ativo,
      modoTeste: dados.modoTeste,
      nome: dados.nome,
      tom: dados.tom,
      promptExtra: dados.promptExtra.trim() ? dados.promptExtra.trim() : null,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      atendeFimDeSemana: dados.atendeFimDeSemana,
    },
    update: {
      ativo: dados.ativo,
      modoTeste: dados.modoTeste,
      nome: dados.nome,
      tom: dados.tom,
      promptExtra: dados.promptExtra.trim() ? dados.promptExtra.trim() : null,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      atendeFimDeSemana: dados.atendeFimDeSemana,
    },
  });
  return paraConfig(gravada);
}

async function listarConversas(autor: AutorEmpresa): Promise<ConversaAssessorDTO[]> {
  exigirVerAssessor(autor);
  const linhas = await prisma.conversaAssessor.findMany({
    where: { empresaId: autor.empresaId },
    orderBy: { atualizadoEm: "desc" },
    take: 50,
    include: {
      cliente: { select: { nomeFantasia: true } },
      pedidos: { where: { status: "ABERTO" }, select: { id: true } },
    },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    telefone: telefoneExibicao(linha.telefone),
    nomeCliente: linha.cliente?.nomeFantasia ?? null,
    iaPausada: linha.iaPausada,
    aguardandoDocumento: linha.aguardandoDocumento,
    janelaAberta: dentroDaJanela(linha.janelaAte, new Date()),
    janelaAte: linha.janelaAte.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
    pedidosAbertos: linha.pedidos.length,
  }));
}

export async function obterConversa(autor: AutorEmpresa, conversaId: string): Promise<ConversaAssessorDetalhe> {
  exigirVerAssessor(autor);
  const linha = await prisma.conversaAssessor.findFirst({
    where: { id: conversaId, empresaId: autor.empresaId },
    include: {
      cliente: { select: { nomeFantasia: true } },
      mensagens: { orderBy: { criadoEm: "asc" }, take: 200 },
      pedidos: { orderBy: { criadoEm: "desc" }, take: 20 },
    },
  });
  if (!linha) throw new ErroAplicacao("Conversa não encontrada.", 404, "nao_encontrado");
  return {
    id: linha.id,
    telefone: telefoneExibicao(linha.telefone),
    nomeCliente: linha.cliente?.nomeFantasia ?? null,
    iaPausada: linha.iaPausada,
    aguardandoDocumento: linha.aguardandoDocumento,
    janelaAberta: dentroDaJanela(linha.janelaAte, new Date()),
    janelaAte: linha.janelaAte.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
    pedidosAbertos: linha.pedidos.filter((pedido) => pedido.status === "ABERTO").length,
    mensagens: linha.mensagens.map((mensagem) => ({
      id: mensagem.id,
      papel: mensagem.papel === "HUMANO" || mensagem.papel === "ASSESSOR" || mensagem.papel === "SISTEMA" ? mensagem.papel : "CLIENTE",
      corpo: mensagem.corpo,
      criadoEm: mensagem.criadoEm.toISOString(),
    })),
    pedidos: linha.pedidos.map((pedido) => ({
      id: pedido.id,
      motivo: pedido.motivo,
      resumo: pedido.resumo,
      status: pedido.status,
      criadoEm: pedido.criadoEm.toISOString(),
    })),
  };
}

async function conversaDaEmpresa(empresaId: string, conversaId: string) {
  const linha = await prisma.conversaAssessor.findFirst({ where: { id: conversaId, empresaId } });
  if (!linha) throw new ErroAplicacao("Conversa não encontrada.", 404, "nao_encontrado");
  return linha;
}

export async function assumirConversa(autor: AutorEmpresa, conversaId: string) {
  exigirVerAssessor(autor);
  await conversaDaEmpresa(autor.empresaId, conversaId);
  await prisma.conversaAssessor.updateMany({
    where: { id: conversaId, empresaId: autor.empresaId },
    data: { iaPausada: true },
  });
  await prisma.pedidoAtendimento.updateMany({
    where: { conversaId, empresaId: autor.empresaId, status: "ABERTO" },
    data: { status: "ASSUMIDO" },
  });
  return obterConversa(autor, conversaId);
}

export async function devolverConversa(autor: AutorEmpresa, conversaId: string) {
  exigirVerAssessor(autor);
  await conversaDaEmpresa(autor.empresaId, conversaId);
  await prisma.conversaAssessor.updateMany({
    where: { id: conversaId, empresaId: autor.empresaId },
    data: { iaPausada: false },
  });
  return obterConversa(autor, conversaId);
}

export async function responderConversa(autor: AutorEmpresa, conversaId: string, entrada: unknown, opcoes: { twilio?: ClienteTwilio; env?: Ambiente; agora?: Date } = {}) {
  exigirVerAssessor(autor);
  const dados = lerEsquema(esquemaRespostaAssessor, entrada);
  const conversa = await conversaDaEmpresa(autor.empresaId, conversaId);
  const agora = opcoes.agora ?? new Date();
  if (!dentroDaJanela(conversa.janelaAte, agora)) {
    throw new ErroAplicacao("A janela de 24 horas desta conversa encerrou. Fora dela não envio texto livre.", 400, "janela");
  }
  const env = opcoes.env ?? process.env;
  const config = await prisma.configuracaoAssessor.findUnique({ where: { empresaId: autor.empresaId } });
  if (config?.modoTeste && numeroTeste(env) !== conversa.telefone) {
    throw new ErroAplicacao("No modo teste a resposta só sai para TWILIO_WHATSAPP_TESTE.", 400, "modo_teste");
  }
  const twilioConfig = await prisma.configuracaoTwilio.findUnique({ where: { empresaId: autor.empresaId } });
  if (!twilioConfig?.senderTelefone || twilioConfig.senderStatus !== "ONLINE") {
    throw new ErroAplicacao("O WhatsApp da empresa ainda não está online.", 400, "whatsapp_offline");
  }
  const destino = config?.modoTeste ? numeroTeste(env) : conversa.telefone;
  if (!destino) throw new ErroAplicacao("Defina TWILIO_WHATSAPP_TESTE para responder no modo teste.", 400, "modo_teste");
  const de = twilioConfig.senderTelefone.startsWith("+")
    ? `whatsapp:${twilioConfig.senderTelefone}`
    : `whatsapp:+${twilioConfig.senderTelefone}`;
  const twilio = opcoes.twilio ?? clienteTwilioPadrao(env);
  const enviada = await twilio.enviarTexto(
    { accountSid: twilioConfig.subaccountSid, authToken: decifrarSegredoAsaas(twilioConfig.authTokenCifrado) },
    { de, para: `whatsapp:+${destino}`, corpo: dados.texto, statusCallback: twilioConfig.webhookUrl },
  );
  await prisma.mensagemAssessor.create({
    data: {
      empresaId: autor.empresaId,
      conversaId: conversa.id,
      papel: "HUMANO",
      corpo: dados.texto,
      messageSid: enviada.sid,
    },
  });
  await prisma.conversaAssessor.updateMany({
    where: { id: conversa.id, empresaId: autor.empresaId },
    data: { iaPausada: true },
  });
  return obterConversa(autor, conversaId);
}
