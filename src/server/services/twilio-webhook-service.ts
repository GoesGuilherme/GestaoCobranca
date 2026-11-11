import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { assinaturaTwilioValida } from "@/lib/twilio-assinatura";
import { decisaoOptOut, digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { processarEntradaAssessor } from "@/server/services/assessor-service";
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

function recusar() {
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
}) {
  const fila = await prisma.filaWhatsapp.findFirst({
    where: { empresaId, messageSid: dados.messageSid },
  });
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

async function registrarEntrada(empresaId: string, dados: {
  messageSid: string;
  de: string | null;
  para: string | null;
  corpo: string | null;
  optOutType: string;
}, opcoes: { assessor?: boolean } = {}) {
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
        corpo: dados.corpo,
      },
    });
  } catch (erro) {
    if (conflito(erro)) return { recebido: true, duplicado: true };
    throw erro;
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
    errorCode: texto(parametros.ErrorCode, 20),
    optOutType: parametros.OptOutType ?? "",
  };
}

export async function processarWebhookTwilio(dados: {
  assinatura: string | null;
  parametros: Record<string, string>;
}) {
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
    return registrarEntrada(config.empresaId, evento);
  }

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
    return registrarEntrada(subconta.empresaId, evento);
  }

  const sandbox = sandboxWhatsappLigado();
  const oficial = remetenteOficialTesteLigado();
  const pai = contaPai(accountSid, sandbox || oficial);
  if (!pai || !assinaturaTwilioValida({
    url: pai.webhookUrl,
    parametros: dados.parametros,
    assinatura,
    authToken: pai.authToken,
  })) {
    recusar();
  }

  const evento = eventoAutenticado(dados.parametros);
  if (!evento.inbound && evento.messageStatus) {
    const deOficial = evento.de === REMETENTE_OFICIAL_WHATSAPP;
    const deSandbox = evento.de === REMETENTE_SANDBOX_WHATSAPP;
    if (!deOficial && !deSandbox) recusar();
    if (deSandbox && !sandbox) recusar();
    const fila = await prisma.filaWhatsapp.findFirst({ where: { messageSid: evento.messageSid } });
    if (!fila) return { recebido: true, duplicado: false };
    if (deSandbox && !fila.modoTeste) return { recebido: true, duplicado: false };
    return registrarStatus(fila.empresaId, { ...evento, messageStatus: evento.messageStatus });
  }

  if (evento.para === REMETENTE_OFICIAL_WHATSAPP) {
    const empresas = await empresasDoClienteOficial(evento.de);
    for (const empresaId of empresas) {
      await registrarEntrada(empresaId, evento, { assessor: false });
    }
    return { recebido: true, duplicado: false };
  }

  if (!sandbox) return { recebido: true, duplicado: false };
  const empresaId = await empresaUnicaDoSandbox(evento.de);
  if (!empresaId) return { recebido: true, duplicado: false };
  return registrarEntrada(empresaId, evento);
}
