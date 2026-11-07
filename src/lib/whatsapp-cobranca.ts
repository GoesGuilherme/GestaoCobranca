import { somenteDigitos, whatsappValido } from "./documento";

export const TIPOS_TEMPLATE_WHATSAPP = ["BOLETO_GERADO", "VENCE_EM_DIAS", "VENCEU", "PAGO"] as const;

export type TipoTemplateWhatsapp = (typeof TIPOS_TEMPLATE_WHATSAPP)[number];

export type TemplateCobrancaWhatsapp = {
  tipo: TipoTemplateWhatsapp;
  nome: string;
  corpo: string;
  variaveisExemplo: Record<string, string>;
};

// Textos UTILITY em pt_BR. A Meta recusa o corpo com o subcódigo 2388299
// ("Leading or trailing parameters not allowed"): a variável não pode abrir nem
// fechar o texto. A Twilio trata placeholder seguido só de pontuação, como
// "{{4}}.", como variável no fim e exige palavras fixas depois.
// https://www.twilio.com/docs/content/using-variables-with-content-api
// Os números seguem a ordem em que aparecem. A revisão da Meta cita como erro
// parâmetros fora de sequência, por exemplo {{1}}, {{2}}, {{5}}, {{4}}.
// Nos três avisos de boleto, atraso e pagamento: {{1}} nome, {{2}} valor,
// {{3}} vencimento, {{4}} link do Asaas.
// Em VENCE_EM_DIAS: {{1}} nome, {{2}} valor, {{3}} dias, {{4}} vencimento, {{5}} link.
// O sufixo _v2 troca o nome: a Meta bloqueia por cerca de 30 dias o nome de um template rejeitado.
const FECHO_TEMPLATE = "Qualquer dúvida, responda esta mensagem.";

export const TEMPLATES_COBRANCA_WHATSAPP: TemplateCobrancaWhatsapp[] = [
  {
    tipo: "BOLETO_GERADO",
    nome: "taguaro_boleto_gerado_v2",
    corpo: `Olá, {{1}}. Seu boleto de {{2}}, com vencimento em {{3}}, foi gerado. Acesse o link do Asaas: {{4}}. ${FECHO_TEMPLATE}`,
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
    },
  },
  {
    tipo: "VENCE_EM_DIAS",
    nome: "taguaro_vence_em_dias_v2",
    corpo: `Olá, {{1}}. Sua cobrança de {{2}} vence em {{3}} dias, na data {{4}}. Acesse o link do Asaas: {{5}}. ${FECHO_TEMPLATE}`,
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "5",
      "4": "30/10/2026",
      "5": "https://www.asaas.com/i/exemplo",
    },
  },
  {
    tipo: "VENCEU",
    nome: "taguaro_venceu_v2",
    corpo: `Olá, {{1}}. A cobrança de {{2}}, com vencimento em {{3}}, está em atraso. Acesse o link do Asaas: {{4}}. ${FECHO_TEMPLATE}`,
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/exemplo",
    },
  },
  {
    tipo: "PAGO",
    nome: "taguaro_pago_v2",
    corpo: `Olá, {{1}}. Confirmamos o pagamento de {{2}} da cobrança com vencimento em {{3}}. O link do Asaas é {{4}}. ${FECHO_TEMPLATE}`,
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
  const nome = dados.nome.replace(/\s+/g, " ").trim().slice(0, 120) || "cliente";
  const valor = dados.valor.replace(/\s+/g, " ").trim().slice(0, 40) || "valor";
  const vencimento = dados.vencimento.replace(/\s+/g, " ").trim().slice(0, 20) || "vencimento";
  if (tipo === "VENCE_EM_DIAS") {
    const dias = (dados.dias ?? "").replace(/\D/g, "").slice(0, 3);
    if (!dias) return null;
    return { "1": nome, "2": valor, "3": dias, "4": vencimento, "5": link };
  }
  return { "1": nome, "2": valor, "3": vencimento, "4": link };
}

const LINK_TEMPLATE = /^https?:\/\/\S+$/i;

function linkDeTemplate(valor: string | undefined): boolean {
  const link = valor ?? "";
  return LINK_TEMPLATE.test(link) && link.length <= 500;
}

// O corpo aprovado na Meta exige este contrato. Um payload antigo de
// VENCE_EM_DIAS punha o link em {{4}} e os dias em {{5}}; isso não pode sair.
export function variaveisCompativeisComTemplate(tipo: string, variaveis: Record<string, string>): boolean {
  if (!TIPOS_TEMPLATE_WHATSAPP.includes(tipo as TipoTemplateWhatsapp)) return false;
  const chaves = Object.keys(variaveis).sort().join(",");
  if (tipo === "VENCE_EM_DIAS") {
    if (chaves !== "1,2,3,4,5") return false;
    if (!/^\d{1,3}$/.test(variaveis["3"] ?? "")) return false;
    if (!variaveis["1"] || !variaveis["2"] || !variaveis["4"]) return false;
    if (linkDeTemplate(variaveis["4"])) return false;
    return linkDeTemplate(variaveis["5"]);
  }
  if (chaves !== "1,2,3,4") return false;
  if (!variaveis["1"] || !variaveis["2"] || !variaveis["3"]) return false;
  if (linkDeTemplate(variaveis["3"])) return false;
  return linkDeTemplate(variaveis["4"]);
}
