import type { TipoTemplateWhatsapp } from "./whatsapp-cobranca";
import { FRASE_BOTAO_PROMESSA, TITULO_BOTAO_PROMESSA } from "./whatsapp-promessa";

// Texto que a empresa edita na tela. Os chips viram {{1}}, {{2}}… na ordem
// em que aparecem. O botão, quando existe, usa o número seguinte.

export const LIMITE_CORPO_TEMPLATE = 1024;

export const FECHO_TEMPLATE_WHATSAPP = "Qualquer dúvida, responda esta mensagem.";

export const CHIPS_TEMPLATE = ["nome", "valor", "vencimento", "link", "dias"] as const;

export type ChipTemplate = (typeof CHIPS_TEMPLATE)[number];

const ROTULO_CHIP: Record<ChipTemplate, string> = {
  nome: "Nome",
  valor: "Valor",
  vencimento: "Vencimento",
  link: "Link",
  dias: "Dias",
};

const EXEMPLO_CHIP: Record<ChipTemplate, string> = {
  nome: "Maria Exemplo",
  valor: "R$ 150,00",
  vencimento: "30/10/2026",
  link: "https://www.asaas.com/i/exemplo",
  dias: "5",
};

function regexChip() {
  return /\{(nome|valor|vencimento|link|dias)\}/g;
}

export function rotuloChipTemplate(chip: ChipTemplate): string {
  return ROTULO_CHIP[chip];
}

export function chipsDoTipo(tipo: TipoTemplateWhatsapp): ChipTemplate[] {
  if (tipo === "VENCE_EM_DIAS") return ["nome", "valor", "dias", "vencimento", "link"];
  return ["nome", "valor", "vencimento", "link"];
}

export function marcaSegura(nome: string): string {
  const limpa = nome.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpa || "sua empresa";
}

export function corpoPadraoEditavel(tipo: TipoTemplateWhatsapp, marca: string, comBotao: boolean): string {
  const empresa = marcaSegura(marca);
  const aviso = `A ${empresa} avisa:`;
  const frase = comBotao ? ` ${FRASE_BOTAO_PROMESSA}` : "";
  const fecho = FECHO_TEMPLATE_WHATSAPP;
  if (tipo === "BOLETO_GERADO") {
    return `Olá, {nome}. ${aviso} seu boleto de {valor}, com vencimento em {vencimento}, foi gerado. Acesse sua fatura: {link}.${frase} ${fecho}`;
  }
  if (tipo === "VENCE_EM_DIAS") {
    return `Olá, {nome}. ${aviso} sua cobrança de {valor} vence em {dias} dias, na data {vencimento}. Acesse sua fatura: {link}.${frase} ${fecho}`;
  }
  if (tipo === "VENCE_HOJE") {
    return `Olá, {nome}. ${aviso} sua cobrança de {valor} vence hoje, na data {vencimento}. Acesse sua fatura: {link}.${frase} ${fecho}`;
  }
  if (tipo === "VENCEU") {
    return `Olá, {nome}. ${aviso} a cobrança de {valor}, com vencimento em {vencimento}, está em atraso. Acesse sua fatura: {link}.${frase} ${fecho}`;
  }
  return `Olá, {nome}. A ${empresa} confirma o pagamento de {valor} da cobrança com vencimento em {vencimento}. O link da fatura é {link}. ${fecho}`;
}

export function corpoTemChip(corpo: string | null | undefined): boolean {
  return /\{(nome|valor|vencimento|link|dias)\}/.test(corpo ?? "");
}

export type CorpoTwilio = {
  corpo: string;
  ordem: ChipTemplate[];
  variaveisExemplo: Record<string, string>;
  variavelBotao: string | null;
};

export type ResultadoCorpo =
  | { ok: true; twilio: CorpoTwilio }
  | { ok: false; mensagem: string };

function semFraseBotao(corpo: string): string {
  return corpo
    .split(FRASE_BOTAO_PROMESSA)
    .join("")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function comFraseBotao(corpo: string): string {
  if (corpo.includes(FRASE_BOTAO_PROMESSA)) return corpo;
  if (corpo.includes(FECHO_TEMPLATE_WHATSAPP)) {
    return corpo.replace(FECHO_TEMPLATE_WHATSAPP, `${FRASE_BOTAO_PROMESSA} ${FECHO_TEMPLATE_WHATSAPP}`);
  }
  return `${corpo.trim()} ${FRASE_BOTAO_PROMESSA}`;
}

export function prepararCorpoParaEnvio(tipo: TipoTemplateWhatsapp, corpo: string, comBotao: boolean): string {
  const base = comBotao && tipo !== "PAGO" ? comFraseBotao(corpo.trim()) : semFraseBotao(corpo);
  return base.replace(/\s+/g, " ").trim();
}

export function numerarChips(corpo: string): { twilio: string; ordem: ChipTemplate[] } | null {
  if (/\{[a-zA-Z0-9_]*\}/.test(corpo.replace(regexChip(), ""))) return null;
  if (corpo.includes("{{") || corpo.includes("}}")) return null;
  const ordem: ChipTemplate[] = [];
  const indice = new Map<ChipTemplate, number>();
  const twilio = corpo.replace(regexChip(), (_todo, nome: ChipTemplate) => {
    let numero = indice.get(nome);
    if (!numero) {
      numero = ordem.length + 1;
      ordem.push(nome);
      indice.set(nome, numero);
    }
    return `{{${numero}}}`;
  });
  return { twilio, ordem };
}

function temLetra(valor: string): boolean {
  return /[\p{L}]/u.test(valor);
}

function variaveisColadas(twilio: string): boolean {
  return /\{\{\d+\}\}[^\p{L}]*\{\{\d+\}\}/u.test(twilio);
}

export function validarCorpoTemplate(
  tipo: TipoTemplateWhatsapp,
  corpo: string,
  comBotao: boolean,
): ResultadoCorpo {
  if (tipo === "PAGO" && comBotao) {
    return { ok: false, mensagem: "O aviso de pagamento não leva o botão de promessa." };
  }
  if (comBotao && TITULO_BOTAO_PROMESSA.length > 20) {
    return { ok: false, mensagem: "O título do botão pode ter no máximo 20 caracteres." };
  }
  const preparado = prepararCorpoParaEnvio(tipo, corpo, comBotao);
  if (!preparado) return { ok: false, mensagem: "Escreva o texto do modelo." };
  if (preparado.length > LIMITE_CORPO_TEMPLATE) {
    return { ok: false, mensagem: `O texto pode ter no máximo ${LIMITE_CORPO_TEMPLATE} caracteres.` };
  }
  const numerado = numerarChips(preparado);
  if (!numerado) {
    return { ok: false, mensagem: "Use só os campos Nome, Valor, Vencimento, Link e, no aviso de dias, Dias." };
  }
  const permitidos = new Set(chipsDoTipo(tipo));
  if (numerado.ordem.some((chip) => !permitidos.has(chip))) {
    return { ok: false, mensagem: "O prazo em dias só entra no modelo que vence em dias." };
  }
  if (!numerado.ordem.includes("link")) {
    return { ok: false, mensagem: "Inclua o link da fatura no texto." };
  }
  const texto = numerado.twilio.trim();
  if (texto.startsWith("{{")) {
    return { ok: false, mensagem: "O texto não pode começar com um campo variável." };
  }
  if (/\{\{\d+\}\}\s*$/.test(texto) || !temLetra(texto.slice(texto.lastIndexOf("}}") + 2))) {
    return { ok: false, mensagem: "O texto não pode terminar num campo variável. Deixe palavras depois do último." };
  }
  if (variaveisColadas(texto)) {
    return { ok: false, mensagem: "Separe os campos variáveis com palavras. Dois campos seguidos não passam na Meta." };
  }
  const variaveisExemplo: Record<string, string> = {};
  numerado.ordem.forEach((chip, indice) => {
    variaveisExemplo[String(indice + 1)] = EXEMPLO_CHIP[chip];
  });
  const variavelBotao = comBotao ? String(numerado.ordem.length + 1) : null;
  return {
    ok: true,
    twilio: { corpo: texto, ordem: numerado.ordem, variaveisExemplo, variavelBotao },
  };
}

const LINK = /^https?:\/\/\S+$/i;

export function variaveisDoCorpoAmigavel(
  corpo: string,
  dados: { nome: string; valor: string; vencimento: string; link: string; dias?: string },
  token: string | null,
): Record<string, string> | null {
  const numerado = numerarChips(corpo.trim());
  if (!numerado) return null;
  const link = dados.link.trim();
  if (!LINK.test(link) || link.length > 500) return null;
  const valores: Record<ChipTemplate, string> = {
    nome: dados.nome.replace(/\s+/g, " ").trim().slice(0, 120) || "cliente",
    valor: dados.valor.replace(/\s+/g, " ").trim().slice(0, 40) || "valor",
    vencimento: dados.vencimento.replace(/\s+/g, " ").trim().slice(0, 20) || "vencimento",
    link,
    dias: (dados.dias ?? "").replace(/\D/g, "").slice(0, 3),
  };
  if (numerado.ordem.includes("dias") && !valores.dias) return null;
  const saida: Record<string, string> = {};
  numerado.ordem.forEach((chip, indice) => {
    saida[String(indice + 1)] = valores[chip];
  });
  if (token) saida[String(numerado.ordem.length + 1)] = token;
  return saida;
}

export function nomeNovoTemplate(tipo: TipoTemplateWhatsapp, agora = new Date()): string {
  const slug = tipo.toLowerCase();
  return `emp_${slug}_${agora.getTime().toString(36)}`.slice(0, 64);
}
