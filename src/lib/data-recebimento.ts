import { dataIsoValida, dataHojeIso } from "@/lib/data";
import { faturaNaSituacao } from "@/lib/fatura-situacao";

/**
 * Dia em que o dinheiro entrou, para somar recebido num período.
 *
 * Usa só o que o Taguaro gravou. Não busca histórico fora da base.
 * 1. pago_em — data do pagamento registrada aqui.
 *    Não há outra coluna de data de pagamento na fatura.
 * 2. Só se pago_em é nulo (fatura antiga, sem data gravada): último recurso,
 *    o dia de atualizado_em já no calendário de São Paulo (YYYY-MM-DD).
 */
export function dataRecebimento(pagoEm: string | null | undefined, atualizadoEmDia: string): string {
  const pago = (pagoEm ?? "").slice(0, 10);
  if (dataIsoValida(pago)) return pago;
  return atualizadoEmDia.slice(0, 10);
}

export function pagoNesteMes(
  fatura: { status: string; excluida: boolean; pagoEm: string | null; atualizadoEm: string },
  hoje: string,
): boolean {
  if (!faturaNaSituacao(fatura, "pagas")) return false;
  const fallback = dataHojeIso(new Date(fatura.atualizadoEm));
  return dataRecebimento(fatura.pagoEm, fallback).slice(0, 7) === hoje.slice(0, 7);
}
