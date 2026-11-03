import { dataPagamentoAsaas } from "@/server/asaas/data-pagamento";
import { statusNormalizado, STATUS_NORMALIZADO } from "@/lib/status-pagamento";
import type { EventoNormalizado, MeioPagamento } from "./tipos";

const EVENTOS_VISUALIZACAO = new Set(["PAYMENT_CHECKOUT_VIEWED", "PAYMENT_BANK_SLIP_VIEWED"]);
const EVENTOS_PAGOS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_DUNNING_RECEIVED"]);

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function meioDe(forma: string | null): MeioPagamento | null {
  if (forma === "BOLETO") return "BOLETO";
  if (forma === "PIX") return "PIX";
  if (forma === "CREDIT_CARD") return "CARTAO";
  return null;
}

function statusBrutoDo(pagamento: Record<string, unknown> | null, tipo: string): string | null {
  const informado = texto(pagamento?.status, 40);
  if (informado) return informado.toUpperCase();
  if (tipo === "PAYMENT_CREATED") return "PENDING";
  if (tipo === "PAYMENT_CONFIRMED") return "CONFIRMED";
  if (tipo === "PAYMENT_RECEIVED") return "RECEIVED";
  if (tipo === "PAYMENT_OVERDUE") return "OVERDUE";
  if (tipo === "PAYMENT_REFUNDED" || tipo === "PAYMENT_PARTIALLY_REFUNDED") return "REFUNDED";
  if (tipo === "PAYMENT_AWAITING_RISK_ANALYSIS") return "AWAITING_RISK_ANALYSIS";
  if (tipo === "PAYMENT_DUNNING_REQUESTED") return "DUNNING_REQUESTED";
  if (tipo === "PAYMENT_DUNNING_RECEIVED") return "DUNNING_RECEIVED";
  return null;
}

function valorDe(pagamento: Record<string, unknown> | null): string | null {
  if (!pagamento) return null;
  const bruto = pagamento.value;
  if (typeof bruto === "number" && Number.isFinite(bruto)) return bruto.toFixed(2);
  if (typeof bruto === "string" && bruto.trim()) return bruto.trim().slice(0, 40);
  return null;
}

// Mesma regra de antes: o nome do evento pago basta; os outros PAYMENT_*
// confirmam quando o status da cobrança já é de pagamento.
export function sinalAsaasConfirmaPagamento(tipo: string, pagamento: Record<string, unknown> | null): boolean {
  if (EVENTOS_PAGOS.has(tipo)) return true;
  const status = typeof pagamento?.status === "string" ? pagamento.status.trim().toUpperCase() : "";
  return statusNormalizado(status) === STATUS_NORMALIZADO.PAGO && tipo.startsWith("PAYMENT_");
}

export function normalizarWebhookAsaas(corpo: unknown): EventoNormalizado | null {
  if (!corpo || typeof corpo !== "object") return null;
  const evento = corpo as { id?: unknown; event?: unknown; payment?: unknown };
  const idEvento = texto(evento.id, 200);
  const tipo = texto(evento.event, 80);
  if (!idEvento || !tipo) return null;
  const pagamento =
    evento.payment && typeof evento.payment === "object" ? (evento.payment as Record<string, unknown>) : null;
  const idExterno = texto(pagamento?.id, 80);
  const visualizacao = EVENTOS_VISUALIZACAO.has(tipo);
  const statusBruto = visualizacao ? null : statusBrutoDo(pagamento, tipo);
  const status = statusBruto ? statusNormalizado(statusBruto) : null;
  const forma = texto(pagamento?.billingType, 32);
  return {
    idEvento,
    idExterno,
    tipo,
    status,
    statusBruto,
    pagoEm: pagamento && status === STATUS_NORMALIZADO.PAGO ? dataPagamentoAsaas(pagamento) : null,
    valor: valorDe(pagamento),
    meio: meioDe(forma),
    visualizacao,
    alteraCobranca: !visualizacao && pagamento !== null && tipo.startsWith("PAYMENT_"),
    confirmaPagamento: sinalAsaasConfirmaPagamento(tipo, pagamento),
    bruto: corpo,
  };
}
