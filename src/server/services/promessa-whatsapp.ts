import { randomBytes } from "node:crypto";
import { dataHojeIso } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { faturaAceitaPromessa } from "@/lib/promessa";
import { somarDias } from "@/lib/regua";
import { digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import {
  EXPIRA_CONVERSA_PROMESSA_MS,
  EXPIRA_TOKEN_PROMESSA_MS,
  classificarDataPromessa,
  dataDaOpcao,
  interpretarRespostaPromessa,
  payloadOpcaoPromessa,
  proximaTentativaPromessa,
  textoCobrancaEncerrada,
  textoConfirmacaoPromessa,
  textoDataEncerrada,
  textoDataInvalida,
  textoDataPassada,
  textoNumeroNaoConfere,
  textoOutraData,
  textoPedidoData,
  textoPrazoPromessa,
  textoPromessaExistente,
  textoSemConversaPromessa,
  tokenPromessaValido,
  valorConfirmado,
} from "@/lib/whatsapp-promessa";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { canalRespostaWhatsapp } from "@/server/services/mensagens-service";
import { registrarPromessaPeloWhatsapp } from "@/server/services/promessa-service";
import type { ClienteTwilio } from "@/server/twilio/contrato";

export type ResultadoPromessaWhatsapp = {
  tratado: boolean;
  status: "PROMESSA_PEDIDO" | "PROMESSA_DATA" | "PROMESSA_REGISTRADA" | "PROMESSA_RECUSADA" | null;
};

type Entrada = {
  empresaId: string;
  de: string | null;
  para: string | null;
  corpo: string | null;
  buttonPayload: string | null;
  twilio: ClienteTwilio;
  agora?: Date;
  env?: NodeJS.ProcessEnv;
};

function gerarToken(): string {
  return `pp1_${randomBytes(32).toString("base64url")}`;
}

function telefoneDe(valor: string | null): string | null {
  if (!valor) return null;
  return digitosWhatsapp(valor.replace(/^whatsapp:/i, ""));
}

function expiracao(agora: Date): Date {
  return new Date(agora.getTime() + EXPIRA_CONVERSA_PROMESSA_MS);
}

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

async function optOutAtivo(empresaId: string, telefone: string): Promise<boolean> {
  const linha = await prisma.optOutWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId, telefone } },
    select: { ativo: true },
  });
  return linha?.ativo === true;
}

async function enviar(
  entrada: Entrada,
  telefone: string,
  clienteId: string | null,
  corpo: string,
): Promise<boolean> {
  if (await optOutAtivo(entrada.empresaId, telefone)) return false;
  try {
    const canal = await canalRespostaWhatsapp(entrada.empresaId, entrada.para, entrada.env ?? process.env);
    const enviada = await entrada.twilio.enviarTexto(canal.conta, {
      de: canal.de,
      para: `whatsapp:+${telefone}`,
      corpo,
      statusCallback: canal.statusCallback,
    });
    try {
      await prisma.respostaWhatsapp.create({
        data: {
          empresaId: entrada.empresaId,
          telefone,
          clienteId,
          usuarioId: null,
          corpo,
          messageSid: enviada.sid,
          origem: "PROMESSA",
        },
      });
    } catch (erro) {
      if (!conflito(erro)) throw erro;
    }
    return true;
  } catch (erro) {
    console.error("promessa_whatsapp_resposta", erro instanceof Error ? erro.name : "falha");
    return false;
  }
}

async function numerosDoCliente(empresaId: string, clienteId: string): Promise<Set<string>> {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { whatsapp: true, filiais: { select: { whatsapp: true } } },
  });
  const numeros = new Set<string>();
  if (!cliente) return numeros;
  const principal = digitosWhatsapp(cliente.whatsapp);
  if (principal) numeros.add(principal);
  for (const filial of cliente.filiais) {
    if (!filial.whatsapp) continue;
    const digitos = digitosWhatsapp(filial.whatsapp);
    if (digitos) numeros.add(digitos);
  }
  return numeros;
}

export async function emitirTokenPromessaWhatsapp(
  empresaId: string,
  faturaId: string,
  agora = new Date(),
): Promise<string | null> {
  const fatura = await prisma.fatura.findFirst({
    where: { id: faturaId, empresaId },
    select: { id: true, clienteId: true, status: true, excluida: true },
  });
  if (!fatura || !faturaAceitaPromessa(fatura.status, fatura.excluida)) return null;
  const vigente = await prisma.tokenPromessaWhatsapp.findFirst({
    where: { empresaId, faturaId: fatura.id, expiraEm: { gt: agora } },
    orderBy: { criadoEm: "desc" },
    select: { token: true },
  });
  if (vigente && tokenPromessaValido(vigente.token) && !vigente.token.includes(fatura.id)) return vigente.token;
  const token = gerarToken();
  await prisma.tokenPromessaWhatsapp.create({
    data: {
      empresaId,
      faturaId: fatura.id,
      clienteId: fatura.clienteId,
      token,
      expiraEm: new Date(agora.getTime() + EXPIRA_TOKEN_PROMESSA_MS),
    },
  });
  return token;
}

async function gravarConversa(dados: {
  empresaId: string;
  faturaId: string;
  clienteId: string;
  telefone: string;
  etapa: "DATA" | "DATA_LIVRE";
  tentativas: number;
  expiraEm: Date;
}) {
  await prisma.conversaPromessaWhatsapp.upsert({
    where: { empresaId_telefone: { empresaId: dados.empresaId, telefone: dados.telefone } },
    create: dados,
    update: {
      faturaId: dados.faturaId,
      clienteId: dados.clienteId,
      etapa: dados.etapa,
      tentativas: dados.tentativas,
      expiraEm: dados.expiraEm,
    },
  });
}

async function apagarConversa(id: string) {
  await prisma.conversaPromessaWhatsapp.deleteMany({ where: { id } });
}

async function cobrarData(
  entrada: Entrada,
  telefone: string,
  clienteId: string,
  valor: string,
  faturaId: string,
  agora: Date,
): Promise<ResultadoPromessaWhatsapp> {
  await enviar(entrada, telefone, clienteId, textoPedidoData(valor));
  await gravarConversa({
    empresaId: entrada.empresaId,
    faturaId,
    clienteId,
    telefone,
    etapa: "DATA",
    tentativas: 0,
    expiraEm: expiracao(agora),
  });
  return { tratado: true, status: "PROMESSA_PEDIDO" };
}

async function recusar(
  entrada: Entrada,
  telefone: string,
  clienteId: string | null,
  corpo: string,
): Promise<ResultadoPromessaWhatsapp> {
  await enviar(entrada, telefone, clienteId, corpo);
  return { tratado: true, status: "PROMESSA_RECUSADA" };
}

async function iniciarPeloToken(entrada: Entrada, telefone: string, token: string, agora: Date): Promise<ResultadoPromessaWhatsapp> {
  if (await optOutAtivo(entrada.empresaId, telefone)) return { tratado: true, status: "PROMESSA_RECUSADA" };
  const linha = await prisma.tokenPromessaWhatsapp.findUnique({ where: { token } });
  if (!linha || linha.empresaId !== entrada.empresaId || linha.expiraEm <= agora) {
    return recusar(entrada, telefone, null, textoNumeroNaoConfere());
  }
  const numeros = await numerosDoCliente(entrada.empresaId, linha.clienteId);
  if (!numeros.has(telefone)) return recusar(entrada, telefone, null, textoNumeroNaoConfere());
  const fatura = await prisma.fatura.findFirst({
    where: { id: linha.faturaId, empresaId: entrada.empresaId, clienteId: linha.clienteId },
    select: { id: true, valor: true, status: true, excluida: true },
  });
  if (!fatura || !faturaAceitaPromessa(fatura.status, fatura.excluida)) {
    return recusar(entrada, telefone, linha.clienteId, textoCobrancaEncerrada());
  }
  const pendente = await prisma.promessaPagamento.findFirst({
    where: { empresaId: entrada.empresaId, faturaId: fatura.id, status: "PENDENTE" },
    select: { id: true },
  });
  if (pendente) return recusar(entrada, telefone, linha.clienteId, textoPromessaExistente());
  return cobrarData(entrada, telefone, linha.clienteId, valorConfirmado(fatura.valor.toFixed(2)), fatura.id, agora);
}

async function repetir(
  entrada: Entrada,
  conversa: { id: string; tentativas: number; clienteId: string; telefone: string },
  mensagem: string,
  agora: Date,
): Promise<ResultadoPromessaWhatsapp> {
  if (proximaTentativaPromessa(conversa.tentativas) === "encerrar") {
    await apagarConversa(conversa.id);
    await enviar(entrada, conversa.telefone, conversa.clienteId, textoDataEncerrada());
    return { tratado: true, status: "PROMESSA_RECUSADA" };
  }
  await prisma.conversaPromessaWhatsapp.update({
    where: { id: conversa.id },
    data: { tentativas: conversa.tentativas + 1, expiraEm: expiracao(agora) },
  });
  await enviar(entrada, conversa.telefone, conversa.clienteId, mensagem);
  return { tratado: true, status: "PROMESSA_DATA" };
}

async function continuar(
  entrada: Entrada,
  telefone: string,
  agora: Date,
): Promise<ResultadoPromessaWhatsapp> {
  if (await optOutAtivo(entrada.empresaId, telefone)) return { tratado: true, status: "PROMESSA_RECUSADA" };
  const conversa = await prisma.conversaPromessaWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId: entrada.empresaId, telefone } },
  });
  if (!conversa || conversa.expiraEm <= agora || conversa.empresaId !== entrada.empresaId) {
    if (conversa) await apagarConversa(conversa.id);
    return recusar(entrada, telefone, conversa?.clienteId ?? null, textoSemConversaPromessa());
  }
  const numeros = await numerosDoCliente(entrada.empresaId, conversa.clienteId);
  if (!numeros.has(telefone)) {
    await apagarConversa(conversa.id);
    return recusar(entrada, telefone, null, textoNumeroNaoConfere());
  }
  const [fatura, empresa] = await Promise.all([
    prisma.fatura.findFirst({
      where: { id: conversa.faturaId, empresaId: entrada.empresaId, clienteId: conversa.clienteId },
      select: { id: true, valor: true, status: true, excluida: true },
    }),
    prisma.empresa.findFirst({
      where: { id: entrada.empresaId },
      select: { prazoMaximoPromessaDias: true },
    }),
  ]);
  if (!fatura || !empresa || !faturaAceitaPromessa(fatura.status, fatura.excluida)) {
    await apagarConversa(conversa.id);
    return recusar(entrada, telefone, conversa.clienteId, textoCobrancaEncerrada());
  }
  const hoje = dataHojeIso(agora);
  const leitura = interpretarRespostaPromessa(entrada.corpo ?? "", entrada.buttonPayload, hoje);
  if (leitura.tipo === "opcao" && leitura.opcao === "outra") {
    await prisma.conversaPromessaWhatsapp.update({
      where: { id: conversa.id },
      data: { etapa: "DATA_LIVRE", tentativas: 0, expiraEm: expiracao(agora) },
    });
    await enviar(entrada, telefone, conversa.clienteId, textoOutraData());
    return { tratado: true, status: "PROMESSA_DATA" };
  }
  const iso = leitura.tipo === "data"
    ? leitura.iso
    : leitura.tipo === "opcao" && leitura.opcao !== "outra"
      ? dataDaOpcao(leitura.opcao, hoje)
      : null;
  if (!iso) {
    const mensagem = conversa.etapa === "DATA_LIVRE" ? textoOutraData() : textoDataInvalida();
    return repetir(entrada, { ...conversa, telefone }, mensagem, agora);
  }
  const prazo = empresa.prazoMaximoPromessaDias;
  const classe = classificarDataPromessa(iso, hoje, prazo);
  if (classe === "passada") return repetir(entrada, { ...conversa, telefone }, textoDataPassada(), agora);
  if (classe === "longe") {
    return repetir(entrada, { ...conversa, telefone }, textoPrazoPromessa(prazo, somarDias(hoje, prazo)), agora);
  }
  if (classe !== "ok") {
    const mensagem = conversa.etapa === "DATA_LIVRE" ? textoOutraData() : textoDataInvalida();
    return repetir(entrada, { ...conversa, telefone }, mensagem, agora);
  }
  try {
    const criada = await registrarPromessaPeloWhatsapp({
      empresaId: entrada.empresaId,
      faturaId: fatura.id,
      clienteId: conversa.clienteId,
      dataPrometida: iso,
      valorPrometido: fatura.valor.toFixed(2),
      agora,
    });
    await apagarConversa(conversa.id);
    await enviar(
      entrada,
      telefone,
      conversa.clienteId,
      textoConfirmacaoPromessa(formatarReais(criada.valorPrometido), criada.dataPrometida),
    );
    return { tratado: true, status: "PROMESSA_REGISTRADA" };
  } catch (erro) {
    await apagarConversa(conversa.id);
    if (erro instanceof ErroAplicacao && erro.codigo === "promessa_pendente") {
      return recusar(entrada, telefone, conversa.clienteId, textoPromessaExistente());
    }
    if (erro instanceof ErroAplicacao && (erro.codigo === "fatura_encerrada" || erro.codigo === "prazo_promessa")) {
      const mensagem = erro.codigo === "prazo_promessa"
        ? textoPrazoPromessa(prazo, somarDias(hoje, prazo))
        : textoCobrancaEncerrada();
      return recusar(entrada, telefone, conversa.clienteId, mensagem);
    }
    throw erro;
  }
}

export async function processarPromessaWhatsapp(entrada: Entrada): Promise<ResultadoPromessaWhatsapp> {
  const telefone = telefoneDe(entrada.de);
  if (!telefone) return { tratado: false, status: null };
  const agora = entrada.agora ?? new Date();
  const payload = entrada.buttonPayload?.trim() ?? "";
  const corpo = entrada.corpo?.trim() ?? "";
  const token = tokenPromessaValido(payload) ? payload : tokenPromessaValido(corpo) ? corpo : null;
  if (token) return iniciarPeloToken(entrada, telefone, token, agora);

  const conversa = await prisma.conversaPromessaWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId: entrada.empresaId, telefone } },
    select: { id: true, expiraEm: true },
  });
  const ativa = Boolean(conversa && conversa.expiraEm > agora);
  if (conversa && !ativa) await apagarConversa(conversa.id);
  if (ativa || payloadOpcaoPromessa(payload)) return continuar(entrada, telefone, agora);
  return { tratado: false, status: null };
}
