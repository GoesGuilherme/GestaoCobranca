import { whatsappE164 } from "@/lib/whatsapp-cobranca";

export const CANAIS_TWILIO = ["WHATSAPP", "SMS"] as const;
export type CanalTwilioEmpresa = (typeof CANAIS_TWILIO)[number];

export const STATUS_NUMERO_TWILIO = ["CADASTRADO", "PENDENTE", "ATIVO", "INATIVO"] as const;
export type StatusNumeroTwilio = (typeof STATUS_NUMERO_TWILIO)[number];

const E164 = /^\+[1-9]\d{7,14}$/;

export function canalTwilio(valor: string): CanalTwilioEmpresa | null {
  return valor === "WHATSAPP" || valor === "SMS" ? valor : null;
}

export function statusNumeroTwilio(valor: string): StatusNumeroTwilio | null {
  return STATUS_NUMERO_TWILIO.includes(valor as StatusNumeroTwilio) ? (valor as StatusNumeroTwilio) : null;
}

export function rotuloCanalTwilio(canal: string): string {
  return canal === "SMS" ? "SMS" : "WhatsApp";
}

export function rotuloStatusNumeroTwilio(status: string): string {
  if (status === "PENDENTE") return "Pendente";
  if (status === "ATIVO") return "Ativo";
  if (status === "INATIVO") return "Inativo";
  return "Cadastrado";
}

export function rotuloTipoTemplateWhatsapp(tipo: string): string {
  if (tipo === "BOLETO_GERADO") return "Boleto gerado";
  if (tipo === "VENCE_EM_DIAS") return "Vence em dias";
  if (tipo === "VENCE_HOJE") return "Vence hoje";
  if (tipo === "VENCEU") return "Venceu";
  if (tipo === "PAGO") return "Pago";
  return "Modelo";
}

export function rotuloStatusTemplateWhatsapp(status: string | null): string {
  if (status === "APROVADO") return "Aprovado";
  if (status === "ENVIADO_APROVACAO") return "Em aprovação";
  if (status === "REJEITADO") return "Rejeitado";
  if (status === "FALHOU") return "Falhou";
  if (status === "RASCUNHO") return "Rascunho";
  return "Não cadastrado";
}

export function rotuloStatusSubconta(status: string, legivel: boolean): string {
  if (!legivel) return "Credencial ilegível";
  if (status === "CONFIGURADA") return "Configurada";
  return "Sem subconta";
}

type AmbienteCriacao = {
  NODE_ENV?: string;
  TWILIO_CRIAR_SUBCONTA?: string;
};

// true só com o valor exato. Qualquer outro texto, inclusive vazio, deixa a criação desligada.
export function criacaoSubcontaHabilitada(env: AmbienteCriacao = process.env): boolean {
  return env.TWILIO_CRIAR_SUBCONTA?.trim().toLowerCase() === "true";
}

export function normalizarTelefoneTwilio(valor: string): string | null {
  const limpo = valor.trim().replace(/^whatsapp:/i, "").replace(/[\s().-]/g, "");
  if (!limpo) return null;
  if (limpo.startsWith("+")) return E164.test(limpo) ? limpo : null;
  const brasil = whatsappE164(limpo);
  return brasil && E164.test(brasil) ? brasil : null;
}

export function remetenteDoCanal(canal: CanalTwilioEmpresa, telefoneE164: string): string {
  return canal === "WHATSAPP" ? `whatsapp:${telefoneE164}` : telefoneE164;
}
