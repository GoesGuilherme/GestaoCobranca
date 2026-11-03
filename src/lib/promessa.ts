import { dataIsoValida } from "./data";
import { normalizarStatus } from "./status-cobranca";
import { somarDias } from "./regua";

/**
 * Promessa de pagamento.
 *
 * Desfecho, sempre pela data em que a fatura foi paga (`pago_em`; se estiver
 * vazia numa fatura já paga, o dia de `atualizado_em` em São Paulo):
 * - paga no dia prometido ou antes: Cumprida;
 * - paga depois: Cumprida com atraso, mesmo que a promessa já tivesse sido
 *   marcada Quebrada;
 * - o dia prometido passou e a fatura não foi paga: Quebrada;
 * - cancelada por alguém enquanto estava pendente, ou porque a fatura foi
 *   cancelada: Cancelada. Não entra na taxa.
 *
 * Enquanto está pendente (até o dia prometido, inclusive), a régua automática
 * daquela fatura não envia lembrete nem cobrança. O aviso de pagamento e o
 * envio manual continuam. No dia seguinte, a promessa quebra e a régua volta.
 *
 * A taxa de cumprimento é cumpridas (no prazo ou com atraso) divididas pelas
 * que já tiveram desfecho no período. Pendente e cancelada ficam de fora.
 * Sem desfecho, a taxa não aparece.
 */

export const CANAIS_PROMESSA = [
  { valor: "WHATSAPP", rotulo: "WhatsApp" },
  { valor: "TELEFONE", rotulo: "Telefone" },
  { valor: "EMAIL", rotulo: "E-mail" },
  { valor: "PRESENCIAL", rotulo: "Presencial" },
  { valor: "OUTRO", rotulo: "Outro" },
] as const;

export type CanalPromessa = (typeof CANAIS_PROMESSA)[number]["valor"];

export const STATUS_PROMESSA = [
  "PENDENTE",
  "CUMPRIDA",
  "CUMPRIDA_COM_ATRASO",
  "QUEBRADA",
  "CANCELADA",
] as const;

export type StatusPromessa = (typeof STATUS_PROMESSA)[number];

const ROTULO_STATUS: Record<StatusPromessa, string> = {
  PENDENTE: "Pendente",
  CUMPRIDA: "Cumprida",
  CUMPRIDA_COM_ATRASO: "Cumprida com atraso",
  QUEBRADA: "Quebrada",
  CANCELADA: "Cancelada",
};

export type MetricasPromessas = {
  abertas: number;
  valorAberto: string;
  vencemHoje: number;
  cumpridas: number;
  quebradas: number;
  taxa: string | null;
  inicio: string;
  fim: string;
};

export function rotuloCanalPromessa(canal: string): string {
  return CANAIS_PROMESSA.find((item) => item.valor === canal)?.rotulo ?? canal;
}

export function rotuloStatusPromessa(status: string): string {
  if (status in ROTULO_STATUS) return ROTULO_STATUS[status as StatusPromessa];
  return status;
}

export function faturaAceitaPromessa(status: string, excluida: boolean): boolean {
  if (excluida) return false;
  const normalizado = normalizarStatus(status);
  return normalizado === "PENDENTE" || normalizado === "VENCIDA";
}

export function faturaPaga(status: string, excluida: boolean): boolean {
  return !excluida && normalizarStatus(status) === "PAGA";
}

export function promessaCobreHoje(status: string, dataPrometida: string, hoje: string): boolean {
  return status === "PENDENTE" && dataIsoValida(dataPrometida) && dataIsoValida(hoje) && dataPrometida >= hoje;
}

export function rotuloPromessaAte(dataPrometida: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataPrometida);
  if (!match) return "Promessa de pagamento";
  return `Promessa até ${match[3]}/${match[2]}`;
}

/**
 * Uma casa, truncada. Total zero não tem taxa.
 * Cumprida com atraso conta como cumprida.
 */
export function taxaCumprimento(cumpridas: number, quebradas: number): string | null {
  if (!Number.isInteger(cumpridas) || !Number.isInteger(quebradas)) return null;
  if (cumpridas < 0 || quebradas < 0) return null;
  const total = cumpridas + quebradas;
  if (total === 0) return null;
  const decimos = Math.floor((cumpridas * 1000) / total);
  const inteiro = Math.floor(decimos / 10);
  const frac = decimos % 10;
  return `${inteiro}.${frac}`;
}

export function metricasPromessaVazias(inicio: string, fim: string): MetricasPromessas {
  return {
    abertas: 0,
    valorAberto: "0.00",
    vencemHoje: 0,
    cumpridas: 0,
    quebradas: 0,
    taxa: null,
    inicio,
    fim,
  };
}

export function inicioJanelaDias(hoje: string, dias: number): string {
  return somarDias(hoje, -Math.abs(dias));
}

export type DesfechoPromessa = {
  status: StatusPromessa;
  cumpridaEm: string | null;
  quebradaEm: string | null;
  cancelada: boolean;
};

/**
 * Próximo status a partir do estado atual e da fatura.
 * Cancelada por pessoa não reabre. Os outros acompanham o pagamento.
 */
export function desfechoPromessa(entrada: {
  status: StatusPromessa;
  dataPrometida: string;
  hoje: string;
  faturaExcluida: boolean;
  faturaStatus: string;
  pagoEm: string | null;
}): DesfechoPromessa {
  const atual = entrada.status;
  if (atual === "CANCELADA") {
    return { status: "CANCELADA", cumpridaEm: null, quebradaEm: null, cancelada: false };
  }
  if (entrada.faturaExcluida) {
    if (atual === "PENDENTE") {
      return { status: "CANCELADA", cumpridaEm: null, quebradaEm: null, cancelada: true };
    }
    return { status: atual, cumpridaEm: null, quebradaEm: atual === "QUEBRADA" ? entrada.hoje : null, cancelada: false };
  }
  if (faturaPaga(entrada.faturaStatus, false)) {
    const dia = entrada.pagoEm && dataIsoValida(entrada.pagoEm) ? entrada.pagoEm : entrada.hoje;
    const noPrazo = dia <= entrada.dataPrometida;
    return {
      status: noPrazo ? "CUMPRIDA" : "CUMPRIDA_COM_ATRASO",
      cumpridaEm: dia,
      quebradaEm: null,
      cancelada: false,
    };
  }
  if (entrada.dataPrometida < entrada.hoje) {
    return { status: "QUEBRADA", cumpridaEm: null, quebradaEm: entrada.hoje, cancelada: false };
  }
  return { status: "PENDENTE", cumpridaEm: null, quebradaEm: null, cancelada: false };
}
