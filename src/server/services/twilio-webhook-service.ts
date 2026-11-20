import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { assinaturaTwilioValida } from "@/lib/twilio-assinatura";
import { decisaoOptOut, digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { textoLivreAtendimento, type TrabalhoAtendimentoIa } from "@/lib/atendimento-ia";
import { processarEntradaAssessor } from "@/server/services/assessor-service";
import { corpoVisivelPromessa } from "@/lib/whatsapp-promessa";
import { processarPromessaWhatsapp } from "@/server/services/promessa-whatsapp";
import { registrarComprovanteRecebido } from "@/server/services/comprovante-service";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { credenciaisPaiTwilio, numeroTesteWhatsapp, urlWebhookTwilio } from "@/server/twilio/fabrica";
import {
  REMETENTE_OFICIAL_WHATSAPP,
  REMETENTE_SANDBOX_WHATSAPP,
  remetenteOficialTesteLigado,
  sandboxWhatsappLigado,
} from "@/server/twilio/sandbox";

function texto(valor: string | undefined, limite: number) {
  const limpo = valor?.trim() ?? "";
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function recusar(): never {
  throw new ErroAplicacao("Assinatura da Twilio recusada.", 403, "twilio_assinatura");
}

const GRAU_ENTREGA = ["queued", "sent", "delivered", "read"];

function grauEntrega(valor: string | null): number {
  const nome = (valor ?? "").replace(/^Twilio\s+/i, "").trim().toLowerCase();
  return GRAU_ENTREGA.indexOf(nome);
}

function contaPai(accountSid: string, permitir: boolean) {
  if (!permitir) return null;
  try {
    const pai = credenciaisPaiTwilio();
    if (pai.accountSid !== accountSid) return null;
    return { ...pai, webhookUrl: urlWebhookTwilio() };
  } catch {
    return null;
  }
}

async function registrarStatus(empresaId: string, dados: {
  messageSid: string;
  messageStatus: string;
  de: string | null;
  para: string | null;
  errorCode: string | null;
  errorMessage?: string | null;
}) {
  const fila = await prisma.filaWhatsapp.findFirst({
    where: { empresaId, messageSid: dados.messageSid },
  });
  const falha = dados.messageStatus === "failed" || dados.messageStatus === "undelivered";
  try {
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId,
        filaId: fila?.id,
        messageSid: dados.messageSid,
        tipo: "STATUS",
        status: dados.messageStatus,
        de: dados.de,
        para: dados.para,
        corpo: falha ? dados.errorMessage ?? null : null,
      },
    });
  } catch (erro) {
    if (conflito(erro)) return { recebido: true, duplicado: true };
    throw erro;
  }
  if (fila && (dados.messageStatus === "failed" || dados.messageStatus === "undelivered")) {
    await prisma.filaWhatsapp.update({
      where: { id: fila.id },
      data: { status: "FALHOU", motivo: `Twilio ${dados.errorCode ?? dados.messageStatus}`.slice(0, 180) },
    });
  } else if (fila && fila.status === "ENVIADO") {
    const grau = grauEntrega(dados.messageStatus);
    if (grau > grauEntrega(fila.motivo)) {
      await prisma.filaWhatsapp.update({
        where: { id: fila.id },
        data: { motivo: `Twilio ${dados.messageStatus}`.slice(0, 180) },
      });
    }
  }
  return { recebido: true, duplicado: false };
}

async function empresasDoClienteOficial(de: string | null): Promise<string[]> {
  const digitos = digitosWhatsapp((de ?? "").replace(/^whatsapp:/i, ""));
  if (!digitos) return [];
  const linhas = await prisma.filaWhatsapp.findMany({
    where: { destino: `whatsapp:+${digitos}`, modoTeste: false },
    select: { empresaId: true },
  });
  return [...new Set(linhas.map((linha) => linha.empresaId))];
}

async function lerComprovantesDaEntrada(
  empresaId: string,
  de: string,
  para: string | null,
  messageSid: string,
  midia: { url: string; mime: string }[],
  opcoes: {
    twilio?: ClienteTwilio;
    agora?: Date;
    conta?: CredencialTwilio;
    baixarMidia?: (url: string) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
) {
  const baixar = opcoes.baixarMidia;
  if (!baixar) return;
  for (const item of midia) {
    const arquivo = await baixar(item.url);
    await registrarComprovanteRecebido({
      empresaId,
      messageSid: midia.length > 1 ? `${messageSid}:${item.url.slice(-12)}` : messageSid,
      de,
      para,
      bytes: arquivo.bytes,
      mime: arquivo.mime || item.mime,
      agora: opcoes.agora,
      twilio: opcoes.twilio,
      conta: opcoes.conta,
    });
  }
}

async function registrarEntrada(empresaId: string, dados: {
  messageSid: string;
  de: string | null;
  para: string | null;
  corpo: string | null;
  buttonPayload: string | null;
  optOutType: string;
  midia?: { url: string; mime: string }[];
}, opcoes: {
  assessor?: boolean;
  twilio?: ClienteTwilio;
  agora?: Date;
  agendarAtendimentoIa?: (trabalho: TrabalhoAtendimentoIa) => void;
  conta?: CredencialTwilio;
  baixarMidia?: (url: string) => Promise<{ bytes: Uint8Array; mime: string }>;
} = {}) {
  const digitos = digitosWhatsapp((dados.de ?? "").replace(/^whatsapp:/i, ""));
  const decisao = decisaoOptOut({ corpo: dados.corpo ?? "", optOutType: dados.optOutType });
  if (digitos && decisao) {
    await prisma.optOutWhatsapp.upsert({
      where: { empresaId_telefone: { empresaId, telefone: digitos } },
      create: { empresaId, telefone: digitos, ativo: decisao === "PARAR", origem: "INBOUND" },
      update: { ativo: decisao === "PARAR", origem: "INBOUND" },
    });
  }
  try {
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId,
        messageSid: dados.messageSid,
        tipo: "INBOUND",
        status: decisao ?? "RECEBIDA",
        de: dados.de,
        para: dados.para,
        corpo: corpoVisivelPromessa(dados.corpo, dados.buttonPayload),
      },
    });
  } catch (erro) {
    if (conflito(erro)) return { recebido: true, duplicado: true };
    throw erro;
  }
  let promessa: { tratado: boolean; status: string | null } = { tratado: false, status: null };
  if (!decisao) {
    try {
      promessa = await processarPromessaWhatsapp({
        empresaId,
        de: dados.de,
        para: dados.para,
        corpo: dados.corpo,
        buttonPayload: dados.buttonPayload,
        twilio: opcoes.twilio ?? clienteTwilioPadrao(),
        agora: opcoes.agora,
      });
    } catch (erro) {
      console.error("promessa_whatsapp", erro instanceof Error ? erro.name : "falha");
    }
  }
  if (promessa.status) {
    await prisma.eventoWhatsapp.updateMany({
      where: { empresaId, messageSid: dados.messageSid, tipo: "INBOUND" },
      data: { status: promessa.status },
    });
  }
  if (dados.midia && dados.midia.length > 0 && dados.de) {
    try {
      await lerComprovantesDaEntrada(empresaId, dados.de, dados.para, dados.messageSid, dados.midia, opcoes);
    } catch (erro) {
      console.error("comprovante_whatsapp", erro instanceof Error ? erro.name : "falha");
    }
  }
  if (promessa.tratado) return { recebido: true, duplicado: false };
  const livre = textoLivreAtendimento(dados.corpo, dados.buttonPayload);
  if (livre && !decisao) {
    const atendimento = await prisma.configuracaoAtendimentoIa.findUnique({
      where: { empresaId },
      select: { ativo: true },
    });
    if (atendimento?.ativo) {
      opcoes.agendarAtendimentoIa?.({
        empresaId,
        messageSid: dados.messageSid,
        de: dados.de ?? "",
        para: dados.para,
        corpo: livre,
        recebidoEm: (opcoes.agora ?? new Date()).toISOString(),
      });
      return { recebido: true, duplicado: false };
    }
  }
  if (opcoes.assessor === false) return { recebido: true, duplicado: false };
  try {
    await processarEntradaAssessor({
      empresaId,
      messageSid: dados.messageSid,
      de: dados.de ?? "",
      corpo: dados.corpo ?? "",
    });
  } catch (erro) {
    console.error("assessor_webhook", erro instanceof Error ? erro.name : "falha");
  }
  return { recebido: true, duplicado: false };
}

// Com várias empresas em modo teste o sandbox não escolhe uma: misturaria dados.
async function empresaUnicaDoSandbox(de: string | null) {
  const digitos = digitosWhatsapp((de ?? "").replace(/^whatsapp:/i, ""));
  const teste = digitosWhatsapp(numeroTesteWhatsapp() ?? "");
  if (!digitos || !teste || digitos !== teste) return null;
  const empresas = await prisma.configuracaoAssessor.findMany({
    where: { ativo: true, modoTeste: true },
    select: { empresaId: true },
  });
  if (empresas.length !== 1) {
    if (empresas.length > 1) console.error("assessor_sandbox_ambiguo");
    return null;
  }
  return empresas[0]?.empresaId ?? null;
}

function eventoAutenticado(parametros: Record<string, string>) {
  const messageSid = texto(parametros.MessageSid || parametros.SmsMessageSid, 64);
  if (!messageSid) {
    throw new ErroAplicacao("Evento da Twilio sem mensagem.", 400, "twilio_invalido");
  }
  const messageStatus = texto(parametros.MessageStatus, 40);
  const inbound = !messageStatus || messageStatus === "received" || parametros.SmsStatus === "received";
  return {
    messageSid,
    messageStatus,
    inbound,
    de: texto(parametros.From, 40),
    para: texto(parametros.To, 40),
    corpo: texto(parametros.Body, 500),
    buttonPayload: texto(parametros.ButtonPayload, 80),
    errorCode: texto(parametros.ErrorCode, 20),
    errorMessage: texto(parametros.ErrorMessage, 180),
    optOutType: parametros.OptOutType ?? "",
    midia: midiasDe(parametros),
  };
}

async function baixarMidiaTwilio(url: string, conta: CredencialTwilio): Promise<{ bytes: Uint8Array; mime: string }> {
  const autorizacao = Buffer.from(`${conta.accountSid}:${conta.authToken}`).toString("base64");
  const resposta = await fetch(url, {
    headers: { authorization: `Basic ${autorizacao}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resposta.ok) throw new Error("midia");
  const mime = resposta.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  return { bytes: new Uint8Array(await resposta.arrayBuffer()), mime };
}

function midiasDe(parametros: Record<string, string>): { url: string; mime: string }[] {
  const quantidade = Number(parametros.NumMedia ?? "0");
  if (!Number.isInteger(quantidade) || quantidade <= 0) return [];
  const lista: { url: string; mime: string }[] = [];
  for (let i = 0; i < Math.min(quantidade, 3); i += 1) {
    const url = texto(parametros[`MediaUrl${i}`], 500);
    const mime = texto(parametros[`MediaContentType${i}`], 80);
    if (url && mime) lista.push({ url, mime });
  }
  return lista;
}

function e164De(valor: string | null): string | null {
  if (!valor) return null;
  const sem = valor.replace(/^whatsapp:/i, "").trim();
  return /^\+[1-9]\d{7,14}$/.test(sem) ? sem : null;
}

// Número próprio da empresa na conta pai. A subconta já foi escolhida pelo
// AccountSid antes desta função. O remetente oficial e o sandbox ficam de fora
// para o caminho atual continuar igual.
async function empresasDoNumero(telefoneE164: string, canal?: "WHATSAPP" | "SMS"): Promise<string[]> {
  const linhas = await prisma.numeroTwilioEmpresa.findMany({
    where: { telefoneE164, status: "ATIVO", ...(canal ? { canal } : {}) },
    select: { empresaId: true },
  });
  const ids = [...new Set(linhas.map((linha) => linha.empresaId))];
  if (ids.length > 1) console.error("twilio_numero_ambiguo");
  return ids;
}

export async function processarWebhookTwilio(dados: {
  assinatura: string | null;
  parametros: Record<string, string>;
  twilio?: ClienteTwilio;
  agora?: Date;
  agendarAtendimentoIa?: (trabalho: TrabalhoAtendimentoIa) => void;
}) {
  const opcoesEntrada = (extra: { assessor?: boolean; conta?: CredencialTwilio } = {}) => ({
    ...extra,
    twilio: dados.twilio,
    agora: dados.agora,
    agendarAtendimentoIa: dados.agendarAtendimentoIa,
    baixarMidia: extra.conta
      ? (url: string) => baixarMidiaTwilio(url, extra.conta as CredencialTwilio)
      : undefined,
  });
  const accountSid = dados.parametros.AccountSid?.trim() ?? "";
  const assinatura = dados.assinatura?.trim() ?? "";
  if (!accountSid || !assinatura) recusar();

  const config = await prisma.configuracaoTwilio.findUnique({ where: { subaccountSid: accountSid } });
  if (config) {
    let authToken = "";
    try {
      authToken = decifrarSegredoAsaas(config.authTokenCifrado);
    } catch {
      recusar();
    }
    if (!assinaturaTwilioValida({
      url: config.webhookUrl,
      parametros: dados.parametros,
      assinatura,
      authToken,
    })) {
      recusar();
    }
    const evento = eventoAutenticado(dados.parametros);
    if (!evento.inbound && evento.messageStatus) {
      return registrarStatus(config.empresaId, { ...evento, messageStatus: evento.messageStatus });
    }
    return registrarEntrada(config.empresaId, evento, opcoesEntrada({
      conta: { accountSid, authToken },
    }));
  }

  // O envio pela subconta usa esta mesma URL em StatusCallback. A assinatura
  // confere o token cifrado desta subconta, não o token da conta pai.
  const subconta = await prisma.subcontaTwilio.findUnique({ where: { subaccountSid: accountSid } });
  if (subconta) {
    let authToken = "";
    try {
      authToken = decifrarSegredoAsaas(subconta.credencialCifrada);
    } catch {
      recusar();
    }
    let webhookUrl = "";
    try {
      webhookUrl = urlWebhookTwilio();
    } catch {
      recusar();
    }
    if (!assinaturaTwilioValida({
      url: webhookUrl,
      parametros: dados.parametros,
      assinatura,
      authToken,
    })) {
      recusar();
    }
    const evento = eventoAutenticado(dados.parametros);
    if (!evento.inbound && evento.messageStatus) {
      return registrarStatus(subconta.empresaId, { ...evento, messageStatus: evento.messageStatus });
    }
    return registrarEntrada(subconta.empresaId, evento, opcoesEntrada({
      conta: { accountSid, authToken },
    }));
  }

  const sandbox = sandboxWhatsappLigado();
  const oficial = remetenteOficialTesteLigado();
  // A assinatura da conta pai vale mesmo com o remetente global desligado:
  // um número da empresa (subcontas_twilio / numeros_twilio_empresa) pode
  // receber o webhook nessa mesma URL. O número global só segue se a flag dele estiver ligada.
  const pai = contaPai(accountSid, true);
  if (!pai || !assinaturaTwilioValida({
    url: pai.webhookUrl,
    parametros: dados.parametros,
    assinatura,
    authToken: pai.authToken,
  })) {
    recusar();
  }
  const permitirGlobal = sandbox || oficial;
  const credencialPai: CredencialTwilio = { accountSid: pai.accountSid, authToken: pai.authToken };

  const evento = eventoAutenticado(dados.parametros);
  if (!evento.inbound && evento.messageStatus) {
    const deOficial = evento.de === REMETENTE_OFICIAL_WHATSAPP;
    const deSandbox = evento.de === REMETENTE_SANDBOX_WHATSAPP;
    if (!deOficial && !deSandbox) {
      const e164 = e164De(evento.de);
      const empresas = e164 ? await empresasDoNumero(e164) : [];
      if (empresas.length !== 1) {
        if (empresas.length > 1) return { recebido: true, duplicado: false };
        recusar();
      }
      const empresaNumero = empresas[0] ?? "";
      const fila = await prisma.filaWhatsapp.findFirst({
        where: { messageSid: evento.messageSid, empresaId: empresaNumero },
      });
      if (!fila) return { recebido: true, duplicado: false };
      return registrarStatus(empresaNumero, { ...evento, messageStatus: evento.messageStatus });
    }
    if (!permitirGlobal) recusar();
    if (deSandbox && !sandbox) recusar();
    const fila = await prisma.filaWhatsapp.findFirst({ where: { messageSid: evento.messageSid } });
    if (!fila) return { recebido: true, duplicado: false };
    if (deSandbox && !fila.modoTeste) return { recebido: true, duplicado: false };
    return registrarStatus(fila.empresaId, { ...evento, messageStatus: evento.messageStatus });
  }

  if (!permitirGlobal) {
    const e164Para = e164De(evento.para);
    if (evento.para?.toLowerCase().startsWith("whatsapp:") && e164Para) {
      const empresas = await empresasDoNumero(e164Para, "WHATSAPP");
      if (empresas.length > 1) return { recebido: true, duplicado: false };
      if (empresas.length === 1) return registrarEntrada(empresas[0] ?? "", evento, opcoesEntrada({ conta: credencialPai }));
    }
    recusar();
  }

  if (evento.para === REMETENTE_OFICIAL_WHATSAPP) {
    const empresas = await empresasDoClienteOficial(evento.de);
    for (const empresaId of empresas) {
      await registrarEntrada(empresaId, evento, opcoesEntrada({ assessor: false, conta: credencialPai }));
    }
    return { recebido: true, duplicado: false };
  }

  const e164Para = e164De(evento.para);
  if (evento.para?.toLowerCase().startsWith("whatsapp:") && e164Para) {
    const empresas = await empresasDoNumero(e164Para, "WHATSAPP");
    if (empresas.length > 1) return { recebido: true, duplicado: false };
    if (empresas.length === 1) return registrarEntrada(empresas[0] ?? "", evento, opcoesEntrada({ conta: credencialPai }));
  }

  if (!sandbox) return { recebido: true, duplicado: false };
  const empresaId = await empresaUnicaDoSandbox(evento.de);
  if (!empresaId) return { recebido: true, duplicado: false };
  return registrarEntrada(empresaId, evento, opcoesEntrada({ conta: credencialPai }));
}
