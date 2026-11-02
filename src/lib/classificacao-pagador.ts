import { dataIsoValida } from "./data";
import { STATUS_PAGAS } from "./fatura-situacao";

/**
 * Classificação de pontualidade de um cliente, só com as faturas da própria
 * empresa. Quem não tem histórico suficiente não recebe selo.
 *
 * Ajuste os limites aqui. A tela só lê o resultado desta função.
 */
export const JANELA_MESES = 12;
/** Faturas com desfecho na janela (pagas com data, ou vencidas em aberto). Abaixo disso, sem selo. */
export const MINIMO_FATURAS = 2;
/** Pagar no dia do vencimento conta como em dia. 0 = sem folga. */
export const TOLERANCIA_DIAS = 0;
/** Média dos dias de atraso, só entre as faturas pagas atrasadas, arredondada ao dia. */
export const ATRASO_MEDIO_MAX_REGULAR_DIAS = 10;
/** Até esta fração das faturas pagas pode ter atraso e o atraso ainda é ocasional. */
export const FRACAO_MAX_COM_ATRASO_REGULAR = 0.3;
/**
 * A fração só caracteriza atraso frequente a partir desta quantidade.
 * Um único atraso curto não é "frequente", mesmo que pese metade de um histórico de duas faturas.
 */
export const MINIMO_ATRASOS_PARA_FREQUENCIA = 2;
/** No máximo estas faturas vencidas em aberto para ainda ser pagador regular. */
export const MAX_VENCIDAS_ABERTO_REGULAR = 1;
/** Vencida em aberto há este número de dias ou mais deixa de ser atraso leve. */
export const DIAS_VENCIDA_ABERTO_GRAVE = 15;

const PAGAS = new Set<string>(STATUS_PAGAS);

/** Canceladas, estornadas e rascunhos locais não entram na conta. */
const IGNORADAS = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "CRIANDO",
  "ERRO_EMISSAO",
]);

export type ClassificacaoPagador = "bom" | "regular" | "mau";

export type FaturaParaClassificar = {
  vencimento: string;
  pagoEm: string | null;
  status: string;
  excluida: boolean;
};

export type ResultadoClassificacaoPagador = {
  classificacao: ClassificacaoPagador;
  rotulo: string;
  tooltip: string;
  pagas: number;
  comAtraso: number;
  mediaAtrasoDias: number;
  vencidasEmAberto: number;
  maiorAtrasoAberto: number;
};

const ROTULOS: Record<ClassificacaoPagador, string> = {
  bom: "Bom pagador",
  regular: "Pagador regular",
  mau: "Mau pagador",
};

export function inicioDaJanela(hoje: string, meses = JANELA_MESES): string {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const cursor = new Date(Date.UTC(ano, mes - 1, 1));
  cursor.setUTCMonth(cursor.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const diaReal = Math.min(dia, ultimo);
  const anoFinal = cursor.getUTCFullYear();
  const mesFinal = String(cursor.getUTCMonth() + 1).padStart(2, "0");
  return `${anoFinal}-${mesFinal}-${String(diaReal).padStart(2, "0")}`;
}

function diasEntre(de: string, ate: string): number {
  const inicio = Date.parse(`${de}T00:00:00.000Z`);
  const fim = Date.parse(`${ate}T00:00:00.000Z`);
  return Math.round((fim - inicio) / 86_400_000);
}

function fraseDias(dias: number): string {
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

function tooltipDe(resultado: Omit<ResultadoClassificacaoPagador, "tooltip" | "rotulo">): string {
  if (resultado.classificacao === "bom") {
    return `Pagou em dia as ${resultado.pagas} faturas dos últimos ${JANELA_MESES} meses.`;
  }
  const partes: string[] = [];
  if (resultado.comAtraso > 0) {
    partes.push(
      `${resultado.comAtraso} de ${resultado.pagas} faturas com atraso, média ${fraseDias(resultado.mediaAtrasoDias)}`,
    );
  }
  if (resultado.vencidasEmAberto === 1) {
    partes.push(`1 fatura vencida em aberto há ${fraseDias(resultado.maiorAtrasoAberto)}`);
  } else if (resultado.vencidasEmAberto > 1) {
    partes.push(
      `${resultado.vencidasEmAberto} faturas vencidas em aberto, a mais antiga há ${fraseDias(resultado.maiorAtrasoAberto)}`,
    );
  }
  if (partes.length === 0) return "Pontualidade dentro do limite de pagador regular.";
  return `${partes.join(". ")}.`;
}

/**
 * Decide uma classificação, ou null quando o histórico da janela não basta.
 * Fatura paga sem data de pagamento fica de fora: não dá para medir o atraso.
 * Vencida em aberto é fatura não paga com vencimento anterior a hoje.
 * Pagar no dia do vencimento (e até TOLERANCIA_DIAS depois) conta como em dia.
 */
export function classificarPagador(
  faturas: readonly FaturaParaClassificar[],
  hoje: string,
): ResultadoClassificacaoPagador | null {
  if (!dataIsoValida(hoje)) return null;
  const inicio = inicioDaJanela(hoje);
  const pagas: number[] = [];
  const abertas: number[] = [];

  for (const fatura of faturas) {
    if (fatura.excluida || IGNORADAS.has(fatura.status)) continue;
    if (!dataIsoValida(fatura.vencimento)) continue;
    if (fatura.vencimento < inicio || fatura.vencimento > hoje) continue;

    if (PAGAS.has(fatura.status)) {
      if (!fatura.pagoEm || !dataIsoValida(fatura.pagoEm)) continue;
      const atraso = diasEntre(fatura.vencimento, fatura.pagoEm) - TOLERANCIA_DIAS;
      pagas.push(Math.max(0, atraso));
      continue;
    }

    if (fatura.vencimento < hoje) abertas.push(diasEntre(fatura.vencimento, hoje));
  }

  if (pagas.length + abertas.length < MINIMO_FATURAS) return null;

  const atrasos = pagas.filter((dias) => dias > 0);
  const mediaExata = atrasos.length === 0 ? 0 : atrasos.reduce((soma, dias) => soma + dias, 0) / atrasos.length;
  const mediaAtrasoDias = Math.round(mediaExata);
  const fracao = pagas.length === 0 ? 0 : atrasos.length / pagas.length;
  const frequente = atrasos.length >= MINIMO_ATRASOS_PARA_FREQUENCIA && fracao > FRACAO_MAX_COM_ATRASO_REGULAR;
  const longo = mediaAtrasoDias > ATRASO_MEDIO_MAX_REGULAR_DIAS;
  const maiorAtrasoAberto = abertas.reduce((maior, dias) => Math.max(maior, dias), 0);
  const abertaGrave = abertas.some((dias) => dias >= DIAS_VENCIDA_ABERTO_GRAVE);
  const abertasDemais = abertas.length > MAX_VENCIDAS_ABERTO_REGULAR;

  let classificacao: ClassificacaoPagador;
  if (frequente || longo || abertaGrave || abertasDemais) classificacao = "mau";
  else if (atrasos.length === 0 && abertas.length === 0) classificacao = "bom";
  else classificacao = "regular";

  const parcial = {
    classificacao,
    pagas: pagas.length,
    comAtraso: atrasos.length,
    mediaAtrasoDias,
    vencidasEmAberto: abertas.length,
    maiorAtrasoAberto,
  };
  return { ...parcial, rotulo: ROTULOS[classificacao], tooltip: tooltipDe(parcial) };
}
