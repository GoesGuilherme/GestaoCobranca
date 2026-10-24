import type { PreferenciasCobrancaDTO } from "./tipos";

export const MODELO_DESCRICAO_PADRAO = "Mensalidade {servico}";

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
  if (valor === "PIX" || valor === "UNDEFINED" || valor === "BOLETO") return valor;
  return "BOLETO";
}
