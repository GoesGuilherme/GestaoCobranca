import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { assinaturaTwilioValida } from "@/lib/twilio-assinatura";
import { decisaoOptOut, digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { processarEntradaAssessor } from "@/server/services/assessor-service";

function texto(valor: string | undefined, limite: number) {
  const limpo = valor?.trim() ?? "";
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

export async function processarWebhookTwilio(dados: {
  assinatura: string | null;
  parametros: Record<string, string>;
}) {
  const accountSid = dados.parametros.AccountSid?.trim() ?? "";
  const assinatura = dados.assinatura?.trim() ?? "";
  if (!accountSid || !assinatura) {
    throw new ErroAplicacao("Assinatura da Twilio recusada.", 403, "twilio_assinatura");
  }
  const config = await prisma.configuracaoTwilio.findUnique({ where: { subaccountSid: accountSid } });
  if (!config) {
    throw new ErroAplicacao("Assinatura da Twilio recusada.", 403, "twilio_assinatura");
  }
  let authToken = "";
  try {
    authToken = decifrarSegredoAsaas(config.authTokenCifrado);
  } catch {
    throw new ErroAplicacao("Assinatura da Twilio recusada.", 403, "twilio_assinatura");
  }
  if (!assinaturaTwilioValida({
    url: config.webhookUrl,
    parametros: dados.parametros,
    assinatura,
    authToken,
  })) {
    throw new ErroAplicacao("Assinatura da Twilio recusada.", 403, "twilio_assinatura");
  }

  const messageSid = texto(dados.parametros.MessageSid || dados.parametros.SmsMessageSid, 64);
  if (!messageSid) {
    throw new ErroAplicacao("Evento da Twilio sem mensagem.", 400, "twilio_invalido");
  }
  const de = texto(dados.parametros.From, 40);
  const para = texto(dados.parametros.To, 40);
  const messageStatus = texto(dados.parametros.MessageStatus, 40);
  const inbound = !messageStatus || messageStatus === "received" || dados.parametros.SmsStatus === "received";

  if (!inbound && messageStatus) {
    const fila = await prisma.filaWhatsapp.findFirst({
      where: { empresaId: config.empresaId, messageSid },
    });
    try {
      await prisma.eventoWhatsapp.create({
        data: {
          empresaId: config.empresaId,
          filaId: fila?.id,
          messageSid,
          tipo: "STATUS",
          status: messageStatus,
          de,
          para,
        },
      });
    } catch (erro) {
      if (conflito(erro)) return { recebido: true, duplicado: true };
      throw erro;
    }
    if (fila && (messageStatus === "failed" || messageStatus === "undelivered")) {
      const codigo = texto(dados.parametros.ErrorCode, 20);
      await prisma.filaWhatsapp.update({
        where: { id: fila.id },
        data: { status: "FALHOU", motivo: `Twilio ${codigo ?? messageStatus}`.slice(0, 180) },
      });
    }
    return { recebido: true, duplicado: false };
  }

  const corpo = texto(dados.parametros.Body, 500);
  const digitos = digitosWhatsapp((de ?? "").replace(/^whatsapp:/i, ""));
  const decisao = decisaoOptOut({ corpo: corpo ?? "", optOutType: dados.parametros.OptOutType ?? "" });
  if (digitos && decisao) {
    await prisma.optOutWhatsapp.upsert({
      where: { empresaId_telefone: { empresaId: config.empresaId, telefone: digitos } },
      create: { empresaId: config.empresaId, telefone: digitos, ativo: decisao === "PARAR", origem: "INBOUND" },
      update: { ativo: decisao === "PARAR", origem: "INBOUND" },
    });
  }
  try {
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId: config.empresaId,
        messageSid,
        tipo: "INBOUND",
        status: decisao ?? "RECEBIDA",
        de,
        para,
        corpo,
      },
    });
  } catch (erro) {
    if (conflito(erro)) return { recebido: true, duplicado: true };
    throw erro;
  }
  try {
    await processarEntradaAssessor({
      empresaId: config.empresaId,
      messageSid,
      de: de ?? "",
      corpo: corpo ?? "",
    });
  } catch (erro) {
    console.error("assessor_webhook", erro instanceof Error ? erro.name : "falha");
  }
  return { recebido: true, duplicado: false };
}
