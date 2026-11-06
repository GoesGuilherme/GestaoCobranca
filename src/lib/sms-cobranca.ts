import type { TipoTemplateWhatsapp } from "./whatsapp-cobranca";
import { digitosWhatsapp, whatsappE164 } from "./whatsapp-cobranca";

// Número Twilio já comprado e Online como WhatsApp Sender.
// É o único From aceito. Outro valor em TWILIO_SMS_FROM é ignorado.
// SMS para o Brasil a partir deste número +1 pode ter entrega irregular.
export const NUMERO_SMS_TWILIO = "+16504762069";

const SAIDA = "Responda PARAR para não receber.";
const LIMITE_CORPO = 1000;

export type AmbienteSms = Record<string, string | undefined> & {
  TWILIO_SMS_ENABLED?: string;
  TWILIO_SMS_FROM?: string;
  TWILIO_SMS_TESTE?: string;
  TWILIO_WHATSAPP_TESTE?: string;
};

export type DadosMensagemSms = {
  empresa: string;
  nome: string;
  valor: string;
  vencimento: string;
  link: string;
  dias?: string;
};

export type DecisaoSms =
  | { enviar: true; de: string; para: string }
  | { enviar: false; motivo: string };

function textoCurto(valor: string, limite: number, reserva: string) {
  const limpo = valor.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, limite);
  return limpo || reserva;
}

function linkSeguro(valor: string) {
  const url = valor.trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500) return "";
  if (/bit\.ly|tinyurl|goo\.gl|t\.co|short\.io/i.test(url)) return "";
  return url;
}

function comAcesso(frase: string, link: string) {
  return link ? `${frase} Acesse: ${link}.` : frase;
}

export function smsHabilitado(env: AmbienteSms = process.env): boolean {
  return env.TWILIO_SMS_ENABLED?.trim().toLowerCase() === "true";
}

export function remetenteSms(env: AmbienteSms = process.env): string | null {
  const digitos = (env.TWILIO_SMS_FROM ?? "").replace(/\D/g, "");
  if (digitos !== "16504762069") return null;
  return NUMERO_SMS_TWILIO;
}

// TWILIO_SMS_TESTE, se existir. Senão, o mesmo número do modo teste do WhatsApp.
export function numeroTesteSms(env: AmbienteSms = process.env): string | null {
  const preferido = env.TWILIO_SMS_TESTE?.trim() ?? "";
  const reserva = env.TWILIO_WHATSAPP_TESTE?.trim() ?? "";
  return whatsappE164(preferido || reserva);
}

// O cliente só tem o campo whatsapp. Não há outro telefone no cadastro.
export function telefoneClienteE164(whatsapp: string): string | null {
  return whatsappE164(whatsapp);
}

export function digitosTelefoneCobranca(valor: string): string | null {
  return digitosWhatsapp(valor);
}

function destinoInformado(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.trim();
  if (/^whatsapp:/i.test(limpo)) return null;
  return whatsappE164(limpo);
}

// O SMS da régua não envia para cliente real. Com a flag ligada, o único To
// aceito é o número de teste, e só com o modo teste da régua ligado.
export function decidirEnvioSms(entrada: {
  habilitado: boolean;
  modoTeste: boolean;
  remetente: string | null;
  teste: string | null;
  telefoneCliente: string | null;
  destinoPedido: string | null;
}): DecisaoSms {
  if (!entrada.habilitado) return { enviar: false, motivo: "SMS desligado" };
  if (!entrada.modoTeste) return { enviar: false, motivo: "SMS só sai no modo teste" };
  if (entrada.remetente !== NUMERO_SMS_TWILIO) return { enviar: false, motivo: "SMS sem remetente" };
  if (!entrada.teste) return { enviar: false, motivo: "modo teste sem número de teste" };
  if (!entrada.telefoneCliente) return { enviar: false, motivo: "cliente sem telefone" };
  const pedido = destinoInformado(entrada.destinoPedido);
  if (!pedido || pedido !== entrada.teste) {
    return { enviar: false, motivo: "modo teste não envia para este número" };
  }
  return { enviar: true, de: NUMERO_SMS_TWILIO, para: entrada.teste };
}

export function prefixoModoTesteSms(corpo: string): string {
  return `Modo teste: esta SMS não foi para o cliente. ${corpo.trim()}`.slice(0, LIMITE_CORPO);
}

export function montarMensagemSms(tipo: TipoTemplateWhatsapp, dados: DadosMensagemSms): string | null {
  const empresa = textoCurto(dados.empresa, 60, "");
  if (!empresa) return null;
  const nome = textoCurto(dados.nome, 80, "cliente");
  const valor = textoCurto(dados.valor, 40, "valor");
  const vencimento = textoCurto(dados.vencimento, 20, "vencimento");
  const link = linkSeguro(dados.link);
  let nucleo = "";
  if (tipo === "BOLETO_GERADO") {
    nucleo = comAcesso(`Olá, ${nome}. Seu boleto de ${valor}, com vencimento em ${vencimento}, foi gerado.`, link);
  } else if (tipo === "VENCE_EM_DIAS") {
    const dias = (dados.dias ?? "").replace(/\D/g, "").slice(0, 3);
    if (!dias) return null;
    const quando = dias === "0"
      ? `vence hoje, na data ${vencimento}`
      : `vence em ${dias} ${dias === "1" ? "dia" : "dias"}, na data ${vencimento}`;
    nucleo = comAcesso(`Olá, ${nome}. Sua cobrança de ${valor} ${quando}.`, link);
  } else if (tipo === "VENCEU") {
    nucleo = comAcesso(`Olá, ${nome}. A cobrança de ${valor}, com vencimento em ${vencimento}, está em atraso.`, link);
  } else if (tipo === "PAGO") {
    nucleo = comAcesso(`Olá, ${nome}. Confirmamos o pagamento de ${valor} da cobrança com vencimento em ${vencimento}.`, link);
  } else {
    return null;
  }
  const corpo = `${empresa}: ${nucleo} ${SAIDA}`;
  if (!corpo.startsWith(`${empresa}:`) || corpo.length > LIMITE_CORPO) return null;
  return corpo;
}

export function rotuloSms(tipo: TipoTemplateWhatsapp, dias: number | null = null): string {
  if (tipo === "BOLETO_GERADO") return "SMS · boleto gerado";
  if (tipo === "VENCEU") return "SMS · venceu";
  if (tipo === "PAGO") return "SMS · pago";
  const n = Math.abs(dias ?? 0);
  if (n === 0) return "SMS · vence hoje";
  return n === 1 ? "SMS · vence em 1 dia" : `SMS · vence em ${n} dias`;
}
