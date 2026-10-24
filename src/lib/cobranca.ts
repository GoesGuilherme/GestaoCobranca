import { somenteDigitos } from "./documento";
import type { PreferenciasCobrancaDTO } from "./tipos";

export const MODELO_DESCRICAO_PADRAO = "Mensalidade {servico}";
export const MODELO_MENSAGEM_PADRAO =
  "Olá, {cliente}. Segue a cobrança de {servico}, no valor de {valor}, com vencimento em {vencimento}: {link}";
export const MODELO_ASSUNTO_PADRAO = "Cobrança de {cliente}";

export const PREFERENCIAS_COBRANCA_PADRAO: PreferenciasCobrancaDTO = {
  formaCobranca: "BOLETO",
  diaVencimento: 10,
  modeloDescricao: MODELO_DESCRICAO_PADRAO,
  multaPercentual: null,
  jurosPercentual: null,
  descontoPercentual: null,
  descontoDiasAntes: null,
  diasAntesGerar: null,
  atualizarPendentes: false,
  modeloMensagem: MODELO_MENSAGEM_PADRAO,
  modeloAssunto: MODELO_ASSUNTO_PADRAO,
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function trocar(texto: string, token: string, valor: string) {
  return texto.split(token).join(valor);
}

export function mesDaCobranca(vencimento: string): string {
  const ano = vencimento.slice(0, 4);
  const mes = Number(vencimento.slice(5, 7));
  if (!/^\d{4}$/.test(ano) || mes < 1 || mes > 12) return "";
  return `${MESES[mes - 1]} de ${ano}`;
}

export function descreverCobranca(
  modelo: string,
  dados: { servico: string; cliente: string; vencimento: string },
): string {
  const base = modelo.trim() || MODELO_DESCRICAO_PADRAO;
  return trocar(
    trocar(trocar(base, "{servico}", dados.servico), "{cliente}", dados.cliente),
    "{mes}",
    mesDaCobranca(dados.vencimento),
  ).slice(0, 500);
}

export function formaCobrancaDe(valor: string | null | undefined): PreferenciasCobrancaDTO["formaCobranca"] {
  if (valor === "PIX" || valor === "UNDEFINED" || valor === "BOLETO" || valor === "CREDIT_CARD") return valor;
  return "BOLETO";
}

export function textoCobranca(
  modelo: string,
  reserva: string,
  dados: { cliente: string; servico: string; valor: string; vencimento: string; link: string },
): string {
  const base = modelo.trim() || reserva;
  return trocar(
    trocar(
      trocar(trocar(trocar(base, "{cliente}", dados.cliente), "{servico}", dados.servico), "{valor}", dados.valor),
      "{vencimento}",
      dados.vencimento,
    ),
    "{link}",
    dados.link,
  ).slice(0, 2000);
}

export function finalCartaoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const compacto = valor.replace(/\s/g, "");
  if (compacto.length > 8) return null;
  const digitos = compacto.replace(/\D/g, "");
  if (digitos.length !== 4) return null;
  return digitos;
}

export function bandeiraCartaoSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpa = valor.trim().toUpperCase();
  if (!/^[A-Z][A-Z ]{0,19}$/.test(limpa)) return null;
  return limpa;
}

export function telefoneWhatsapp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = somenteDigitos(valor);
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

export function linkWhatsapp(telefone: string | null | undefined, texto: string): string | null {
  const numero = telefoneWhatsapp(telefone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkEmail(email: string | null | undefined, assunto: string, corpo: string): string | null {
  const destino = email?.trim() ?? "";
  if (!destino.includes("@") || /\s/.test(destino)) return null;
  return `mailto:${destino}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
