import { bandeiraCartaoSegura, finalCartaoSeguro } from "@/lib/cobranca";
import { dataIsoValida } from "@/lib/data";
import { dataPagamentoAsaas } from "@/server/asaas/data-pagamento";
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

const CONFIRMADOS = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);

function pagoEmDoPagamento(status: string, pagamento: Record<string, unknown>): Date | null | undefined {
  if (!CONFIRMADOS.has(status)) return null;
  const iso = dataPagamentoAsaas(pagamento);
  if (!iso) return undefined;
  return new Date(`${iso}T00:00:00.000Z`);
}

function cartaoDoPagamento(pagamento: Record<string, unknown>) {
  const bruto = pagamento.creditCard;
  if (!bruto || typeof bruto !== "object") return { bandeira: null, final: null };
  const corpo = bruto as Record<string, unknown>;
  return {
    bandeira: bandeiraCartaoSegura(corpo.creditCardBrand),
    final: finalCartaoSeguro(corpo.creditCardNumber),
  };
}

async function refletirCartao(
  tx: Prisma.TransactionClient,
  empresaId: string,
  clienteServicoId: string | null,
  dados: {
    forma: string;
    status: string;
    tipo: string;
    url: string | null;
    bandeira: string | null;
    final: string | null;
  },
) {
  if (!clienteServicoId) return;
  const atual = await tx.clienteServico.findFirst({
    where: { id: clienteServicoId, empresaId },
    select: { cartaoStatus: true, formaCobrancaRecorrente: true },
  });
  if (!atual) return;
  const deCartao = dados.forma === "CREDIT_CARD" || atual.formaCobrancaRecorrente === "CREDIT_CARD";
  if (!deCartao && dados.tipo !== "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED") {
    if (dados.url) {
      await tx.clienteServico.updateMany({
        where: { id: clienteServicoId, empresaId },
        data: { urlCobranca: dados.url },
      });
    }
    return;
  }
  const recusado = dados.tipo === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED";
  const confirmado =
    dados.tipo === "PAYMENT_CONFIRMED" || dados.tipo === "PAYMENT_RECEIVED" || CONFIRMADOS.has(dados.status);
  let cartaoStatus = atual.cartaoStatus;
  if (recusado) cartaoStatus = "RECUSADO";
  else if (confirmado) cartaoStatus = "CADASTRADO";
  else if (!cartaoStatus) cartaoStatus = "AGUARDANDO";
  await tx.clienteServico.updateMany({
    where: { id: clienteServicoId, empresaId },
    data: {
      cartaoStatus,
      ...(dados.url ? { urlCobranca: dados.url } : {}),
      ...(cartaoStatus === "CADASTRADO" && dados.bandeira ? { cartaoBandeira: dados.bandeira } : {}),
      ...(cartaoStatus === "CADASTRADO" && dados.final ? { cartaoFinal: dados.final } : {}),
    },
  });
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
  const cartao = cartaoDoPagamento(pagamento);
  const pagoEm = pagoEmDoPagamento(status, pagamento);
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
        ...(pagoEm !== undefined ? { pagoEm } : {}),
        ...(!existente.clienteServicoId && vinculo ? { clienteServicoId: vinculo.id } : {}),
      },
    });
    await refletirCartao(tx, empresaId, vinculo?.id ?? existente.clienteServicoId, {
      forma,
      status,
      tipo,
      url: faturaUrl ?? boletoUrl,
      bandeira: cartao.bandeira,
      final: cartao.final,
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
      pagoEm: pagoEm ?? null,
    },
  });
  await refletirCartao(tx, empresaId, vinculo?.id ?? null, {
    forma,
    status,
    tipo,
    url: faturaUrl ?? boletoUrl,
    bandeira: cartao.bandeira,
    final: cartao.final,
  });
  return "criada";
}

export async function espelharCobrancaImportada(
  empresaId: string,
  pagamento: Record<string, unknown>,
): Promise<"criada" | "atualizada" | "ignorada"> {
  return prisma.$transaction((tx) => espelharPagamentoAsaas(tx, empresaId, pagamento, "IMPORT"));
}
