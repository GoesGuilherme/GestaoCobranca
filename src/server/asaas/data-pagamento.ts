import { dataIsoValida } from "@/lib/data";

function dataIso(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const iso = valor.trim().slice(0, 10);
  return dataIsoValida(iso) ? iso : null;
}

/** Dia em que o cliente pagou. clientPaymentDate vence paymentDate e confirmedDate. */
export function dataPagamentoAsaas(corpo: Record<string, unknown>): string | null {
  return dataIso(corpo.clientPaymentDate) ?? dataIso(corpo.paymentDate) ?? dataIso(corpo.confirmedDate);
}
