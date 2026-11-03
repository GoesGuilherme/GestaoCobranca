import { statusBrutos, statusNormalizado, STATUS_NORMALIZADO } from "./status-pagamento";
import type { FiltroVisualizacao, SituacaoFatura } from "./tipos";

export const STATUS_ABERTAS = statusBrutos("PENDENTE");
export const STATUS_VENCIDAS = statusBrutos("VENCIDO");
export const STATUS_PAGAS = statusBrutos("PAGO");

export type TomFatura = "aberto" | "vencida" | "paga" | "cancelada" | "estorno";

type FaturaSituacao = { status: string; excluida: boolean };

export function faturaNaSituacao(fatura: FaturaSituacao, situacao: SituacaoFatura): boolean {
  if (situacao === "todas") return true;
  if (situacao === "canceladas") return fatura.excluida;
  if (fatura.excluida) return false;
  const normalizado = statusNormalizado(fatura.status);
  if (situacao === "vencidas") return normalizado === STATUS_NORMALIZADO.VENCIDO;
  if (situacao === "pagas") return normalizado === STATUS_NORMALIZADO.PAGO;
  return normalizado === STATUS_NORMALIZADO.PENDENTE || normalizado === STATUS_NORMALIZADO.VENCIDO;
}

export function tomFatura(status: string, excluida: boolean): TomFatura {
  if (excluida) return "cancelada";
  const normalizado = statusNormalizado(status);
  if (normalizado === STATUS_NORMALIZADO.CANCELADO) return "cancelada";
  if (normalizado === STATUS_NORMALIZADO.VENCIDO) return "vencida";
  if (normalizado === STATUS_NORMALIZADO.PAGO) return "paga";
  if (normalizado === STATUS_NORMALIZADO.ESTORNADO) return "estorno";
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

function comparar(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
