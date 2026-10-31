import type { FiltroVisualizacao, SituacaoFatura } from "./tipos";

export const STATUS_ABERTAS = ["PENDING", "AWAITING_RISK_ANALYSIS"] as const;
export const STATUS_VENCIDAS = ["OVERDUE", "DUNNING_REQUESTED"] as const;
export const STATUS_PAGAS = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] as const;

const ESTORNO = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

export type TomFatura = "aberto" | "vencida" | "paga" | "cancelada" | "estorno";

type FaturaSituacao = { status: string; excluida: boolean };

export function faturaNaSituacao(fatura: FaturaSituacao, situacao: SituacaoFatura): boolean {
  if (situacao === "todas") return true;
  if (situacao === "canceladas") return fatura.excluida;
  if (fatura.excluida) return false;
  if (situacao === "vencidas") return inclui(STATUS_VENCIDAS, fatura.status);
  if (situacao === "pagas") return inclui(STATUS_PAGAS, fatura.status);
  return inclui(STATUS_ABERTAS, fatura.status) || inclui(STATUS_VENCIDAS, fatura.status);
}

export function tomFatura(status: string, excluida: boolean): TomFatura {
  if (excluida) return "cancelada";
  if (inclui(STATUS_VENCIDAS, status)) return "vencida";
  if (inclui(STATUS_PAGAS, status)) return "paga";
  if (ESTORNO.has(status)) return "estorno";
  return "aberto";
}

type FaturaOrdenavel = FaturaSituacao & { vencimento: string; atualizadoEm: string };

export function faturasNaSituacao<T extends FaturaOrdenavel>(faturas: T[], situacao: SituacaoFatura): T[] {
  const lista = faturas.filter((fatura) => faturaNaSituacao(fatura, situacao));
  lista.sort((a, b) => {
    if (situacao === "em_aberto" || situacao === "vencidas") return comparar(a.vencimento, b.vencimento);
    if (situacao === "pagas" || situacao === "canceladas") return comparar(b.atualizadoEm, a.atualizadoEm);
    return comparar(b.vencimento, a.vencimento);
  });
  return lista;
}

export function faturaNaVisualizacao(fatura: { visualizada: boolean }, filtro: FiltroVisualizacao): boolean {
  if (filtro === "vistas") return fatura.visualizada;
  if (filtro === "nao_vistas") return !fatura.visualizada;
  return true;
}

export function faturasNaVisualizacao<T extends { visualizada: boolean }>(
  faturas: T[],
  filtro: FiltroVisualizacao,
): T[] {
  return faturas.filter((fatura) => faturaNaVisualizacao(fatura, filtro));
}

function inclui(lista: readonly string[], status: string): boolean {
  return lista.some((item) => item === status);
}

function comparar(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
