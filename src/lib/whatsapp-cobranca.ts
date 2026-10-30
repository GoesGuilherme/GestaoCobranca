import { somenteDigitos, whatsappValido } from "./documento";

export const TIPOS_TEMPLATE_WHATSAPP = ["BOLETO_GERADO", "VENCE_EM_DIAS", "VENCEU", "PAGO"] as const;

export type TipoTemplateWhatsapp = (typeof TIPOS_TEMPLATE_WHATSAPP)[number];

export type TemplateCobrancaWhatsapp = {
  tipo: TipoTemplateWhatsapp;
  nome: string;
  corpo: string;
  variaveisExemplo: Record<string, string>;
};

// Textos UTILITY. A variável não fica no começo nem no fim: a Twilio/Meta recusam isso.
// {{1}} nome, {{2}} valor, {{3}} vencimento, {{4}} link do Asaas.
// No lembrete "vence em X dias", {{5}} é o X (quantidade de dias).
export const TEMPLATES_COBRANCA_WHATSAPP: TemplateCobrancaWhatsapp[] = [
  {
    tipo: "BOLETO_GERADO",
    nome: "taguaro_boleto_gerado",
    corpo: "Olá, {{1}}. Seu boleto de {{2}}, com vencimento em {{3}}, foi gerado. Acesse o link do Asaas: {{4}}.",
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
    },
  },
  {
    tipo: "VENCE_EM_DIAS",
    nome: "taguaro_vence_em_dias",
    corpo: "Olá, {{1}}. Sua cobrança de {{2}} vence em {{5}} dias, na data {{3}}. Acesse o link do Asaas: {{4}}.",
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
      "5": "5",
    },
  },
  {
    tipo: "VENCEU",
    nome: "taguaro_venceu",
    corpo: "Olá, {{1}}. A cobrança de {{2}}, com vencimento em {{3}}, está em atraso. Acesse o link do Asaas: {{4}}.",
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
    },
  },
  {
    tipo: "PAGO",
    nome: "taguaro_pago",
    corpo: "Olá, {{1}}. Confirmamos o pagamento de {{2}} da cobrança com vencimento em {{3}}. O link do Asaas é {{4}}.",
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
    },
  },
];

export function templateCobrancaWhatsapp(tipo: TipoTemplateWhatsapp): TemplateCobrancaWhatsapp {
  const encontrado = TEMPLATES_COBRANCA_WHATSAPP.find((item) => item.tipo === tipo);
  if (!encontrado) throw new Error("Template de WhatsApp desconhecido.");
  return encontrado;
}

export function tipoTemplateDoPasso(passo: { naEmissao: boolean; dias: number | null }): Exclude<TipoTemplateWhatsapp, "PAGO"> {
  if (passo.naEmissao) return "BOLETO_GERADO";
  if ((passo.dias ?? 0) > 0) return "VENCEU";
  return "VENCE_EM_DIAS";
}

export function rotuloTemplateWhatsapp(tipo: TipoTemplateWhatsapp, dias: number | null = null): string {
  if (tipo === "BOLETO_GERADO") return "WhatsApp · boleto gerado";
  if (tipo === "VENCEU") return "WhatsApp · venceu";
  if (tipo === "PAGO") return "WhatsApp · pago";
  const n = Math.abs(dias ?? 0);
  return n === 1 ? "WhatsApp · vence em 1 dia" : `WhatsApp · vence em ${n} dias`;
}

export function whatsappE164(valor: string): string | null {
  const digitos = somenteDigitos(valor);
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    const nacional = digitos.slice(2);
    if (whatsappValido(nacional)) return `+${digitos}`;
  }
  if (whatsappValido(digitos)) return `+55${digitos}`;
  return null;
}

export function digitosWhatsapp(valor: string): string | null {
  const e164 = whatsappE164(valor);
  if (!e164) return null;
  return e164.replace(/\D/g, "");
}

const PARAR = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "PARAR", "SAIR", "CANCELAR", "REMOVER"]);
const RETOMAR = new Set(["START", "UNSTOP", "RETOMAR", "REATIVAR"]);

export function decisaoOptOut(dados: { corpo: string; optOutType: string }): "PARAR" | "RETOMAR" | null {
  const tipo = dados.optOutType.trim().toUpperCase();
  if (tipo === "STOP") return "PARAR";
  if (tipo === "START") return "RETOMAR";
  const texto = dados.corpo.trim().toUpperCase();
  if (!texto || texto.length > 40) return null;
  if (PARAR.has(texto)) return "PARAR";
  if (RETOMAR.has(texto)) return "RETOMAR";
  return null;
}

export function variaveisDoTemplate(
  tipo: TipoTemplateWhatsapp,
  dados: { nome: string; valor: string; vencimento: string; link: string; dias?: string },
): Record<string, string> | null {
  const link = dados.link.trim();
  if (!/^https?:\/\/\S+$/i.test(link) || link.length > 500) return null;
  const base: Record<string, string> = {
    "1": dados.nome.replace(/\s+/g, " ").trim().slice(0, 120) || "cliente",
    "2": dados.valor.replace(/\s+/g, " ").trim().slice(0, 40) || "valor",
    "3": dados.vencimento.replace(/\s+/g, " ").trim().slice(0, 20) || "vencimento",
    "4": link,
  };
  if (tipo === "VENCE_EM_DIAS") {
    const dias = (dados.dias ?? "").replace(/\D/g, "").slice(0, 3);
    if (!dias) return null;
    base["5"] = dias;
  }
  return base;
}
