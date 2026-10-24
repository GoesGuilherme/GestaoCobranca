import { dataIsoValida } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

const STATUS_POR_EVENTO: Record<string, string> = {
  PAYMENT_CREATED: "PENDING",
  PAYMENT_CONFIRMED: "CONFIRMED",
  PAYMENT_RECEIVED: "RECEIVED",
  PAYMENT_OVERDUE: "OVERDUE",
  PAYMENT_REFUNDED: "REFUNDED",
  PAYMENT_PARTIALLY_REFUNDED: "REFUNDED",
  PAYMENT_AWAITING_RISK_ANALYSIS: "AWAITING_RISK_ANALYSIS",
  PAYMENT_DUNNING_REQUESTED: "DUNNING_REQUESTED",
  PAYMENT_DUNNING_RECEIVED: "DUNNING_RECEIVED",
};

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function idAsaas(valor: string | null): string | null {
  if (!valor || !/^[A-Za-z0-9_-]{1,80}$/.test(valor)) return null;
  return valor;
}

function statusDoEvento(tipo: string, pagamento: Record<string, unknown>) {
  const informado = texto(pagamento.status, 40);
  if (informado) return informado.toUpperCase();
  return STATUS_POR_EVENTO[tipo] ?? "PENDING";
}

function exclusao(tipo: string, pagamento: Record<string, unknown>): boolean | undefined {
  if (tipo === "PAYMENT_RESTORED") return false;
  if (tipo === "IMPORT") return pagamento.deleted === true;
  if (tipo === "PAYMENT_DELETED" || pagamento.deleted === true) return true;
  return undefined;
}

export async function espelharPagamentoAsaas(
  tx: Prisma.TransactionClient,
  empresaId: string,
  pagamento: Record<string, unknown>,
  tipo: string,
): Promise<"criada" | "atualizada" | "ignorada"> {
  const asaasPaymentId = idAsaas(texto(pagamento.id, 80));
  if (!asaasPaymentId) return "ignorada";

  const status = statusDoEvento(tipo, pagamento);
  const valorBruto = typeof pagamento.value === "number" || typeof pagamento.value === "string" ? pagamento.value : null;
  const valor = valorBruto === null ? null : normalizarDinheiro(valorBruto);
  const vencimento = texto(pagamento.dueDate, 10);
  const vencimentoValido = vencimento && dataIsoValida(vencimento) ? vencimento : null;
  const forma = texto(pagamento.billingType, 32) ?? "BOLETO";
  const excluida = exclusao(tipo, pagamento);
  const boletoUrl = texto(pagamento.bankSlipUrl, 2000);
  const faturaUrl = texto(pagamento.invoiceUrl, 2000);
  const descricao = texto(pagamento.description, 500);
  const subscriptionId = idAsaas(texto(pagamento.subscription, 80));
  const vinculo = subscriptionId
    ? await tx.clienteServico.findFirst({
        where: { empresaId, asaasSubscriptionId: subscriptionId },
        select: { id: true, clienteId: true },
      })
    : null;

  const existente = await tx.fatura.findUnique({
    where: { empresaId_asaasPaymentId: { empresaId, asaasPaymentId } },
  });

  if (existente) {
    await tx.fatura.update({
      where: { id: existente.id },
      data: {
        status,
        ...(valor ? { valor } : {}),
        ...(vencimentoValido ? { vencimento: new Date(`${vencimentoValido}T00:00:00.000Z`) } : {}),
        formaCobranca: forma,
        ...(excluida !== undefined ? { excluida } : {}),
        ...(boletoUrl ? { boletoUrl } : {}),
        ...(faturaUrl ? { faturaUrl } : {}),
        ...(descricao ? { descricao } : {}),
        ...(!existente.clienteServicoId && vinculo ? { clienteServicoId: vinculo.id } : {}),
      },
    });
    return "atualizada";
  }

  const customer = idAsaas(texto(pagamento.customer, 80));
  let clienteId = vinculo?.clienteId ?? null;
  if (!clienteId && customer) {
    const cliente = await tx.cliente.findFirst({
      where: { empresaId, asaasCustomerId: customer },
      select: { id: true },
    });
    clienteId = cliente?.id ?? null;
  }
  if (!clienteId || !valor || !vencimentoValido) return "ignorada";

  await tx.fatura.create({
    data: {
      empresaId,
      clienteId,
      clienteServicoId: vinculo?.id ?? null,
      asaasPaymentId,
      valor,
      vencimento: new Date(`${vencimentoValido}T00:00:00.000Z`),
      status,
      formaCobranca: forma,
      boletoUrl,
      faturaUrl,
      descricao,
      excluida: excluida ?? false,
    },
  });
  return "criada";
}

export async function espelharCobrancaImportada(
  empresaId: string,
  pagamento: Record<string, unknown>,
): Promise<"criada" | "atualizada" | "ignorada"> {
  return prisma.$transaction((tx) => espelharPagamentoAsaas(tx, empresaId, pagamento, "IMPORT"));
}
