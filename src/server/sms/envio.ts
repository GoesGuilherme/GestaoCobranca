import { NUMERO_SMS_TWILIO, type DecisaoSms } from "@/lib/sms-cobranca";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";

export type ResultadoEnvioSms = { enviado: true; sid: string } | { enviado: false; motivo: string };

// Última barreira antes da API Messages. Não usa o canal WhatsApp:
// From e To são E.164, sem prefixo whatsapp:, e o corpo vai em Body.
export async function enviarSmsAutorizado(
  twilio: Pick<ClienteTwilio, "enviarTexto">,
  conta: CredencialTwilio,
  pedido: {
    decisao: DecisaoSms;
    teste: string | null;
    corpo: string;
    statusCallback: string;
  },
): Promise<ResultadoEnvioSms> {
  if (!pedido.decisao.enviar) return { enviado: false, motivo: pedido.decisao.motivo };
  const para = pedido.decisao.para;
  const de = pedido.decisao.de;
  const teste = pedido.teste;
  if (
    !teste ||
    de !== NUMERO_SMS_TWILIO ||
    para !== teste ||
    !para.startsWith("+") ||
    para.toLowerCase().includes("whatsapp")
  ) {
    return { enviado: false, motivo: "modo teste não envia para este número" };
  }
  const corpo = pedido.corpo.trim();
  if (!corpo || corpo.length > 1000) return { enviado: false, motivo: "mensagem inválida" };
  const callback = pedido.statusCallback.trim();
  if (!callback.startsWith("https://") || !callback.includes("/api/webhooks/twilio")) {
    return { enviado: false, motivo: "SMS sem webhook" };
  }
  const envio = await twilio.enviarTexto(conta, {
    de,
    para,
    corpo,
    statusCallback: callback,
  });
  return { enviado: true, sid: envio.sid };
}
