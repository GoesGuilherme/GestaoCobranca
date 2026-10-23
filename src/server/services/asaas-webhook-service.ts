import { dataIsoValida } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";

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

function conflitoDeEvento(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const mensagem = "message" in erro && typeof erro.message === "string" ? erro.message : "";
  const meta = "meta" in erro ? (erro.meta as { target?: unknown } | undefined) : undefined;
  const alvo = meta?.target;
  const textoAlvo = Array.isArray(alvo) ? alvo.join(" ") : typeof alvo === "string" ? alvo : "";
  const texto = `${textoAlvo} ${mensagem}`;
  return texto.includes("asaas_event_id") || texto.includes("asaasEventId");
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function statusDoEvento(tipo: string, pagamento: Record<string, unknown>) {
  const informado = texto(pagamento.status, 40);
  if (informado) return informado.toUpperCase();
  return STATUS_POR_EVENTO[tipo] ?? "PENDING";
}

function exclusao(tipo: string, pagamento: Record<string, unknown>): boolean | undefined {
  if (tipo === "PAYMENT_RESTORED") return false;
  if (tipo === "PAYMENT_DELETED" || pagamento.deleted === true) return true;
  return undefined;
}

export async function processarWebhookAsaas(token: string | null, corpo: unknown) {
  const recebido = token?.trim() ?? "";
  if (!recebido) {
    throw new ErroAplicacao("Token do webhook recusado.", 401, "webhook_recusado");
  }
  if (!corpo || typeof corpo !== "object") {
    throw new ErroAplicacao("Evento do Asaas inválido.", 400, "webhook_invalido");
  }

  const evento = corpo as { id?: unknown; event?: unknown; payment?: unknown };
  const asaasEventId = texto(evento.id, 200);
  const tipo = texto(evento.event, 80);
  if (!asaasEventId || !tipo) {
    throw new ErroAplicacao("Evento do Asaas inválido.", 400, "webhook_invalido");
  }

  const hash = hashTokenWebhook(recebido);
  const config = await prisma.configuracaoAsaas.findUnique({ where: { tokenWebhookHash: hash } });
  if (!config || !tokensWebhookIguais(recebido, config.tokenWebhookHash)) {
    throw new ErroAplicacao("Token do webhook recusado.", 401, "webhook_recusado");
  }

  const pagamento =
    evento.payment && typeof evento.payment === "object" ? (evento.payment as Record<string, unknown>) : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventoAsaas.create({
        data: { empresaId: config.empresaId, asaasEventId, tipo },
      });
      if (!pagamento || !tipo.startsWith("PAYMENT_")) return;

      const asaasPaymentId = texto(pagamento.id, 80);
      if (!asaasPaymentId) return;

      const status = statusDoEvento(tipo, pagamento);
      const valor = normalizarDinheiro(pagamento.value);
      const vencimento = texto(pagamento.dueDate, 10);
      const vencimentoValido = vencimento && dataIsoValida(vencimento) ? vencimento : null;
      const forma = texto(pagamento.billingType, 32) ?? "BOLETO";
      const excluida = exclusao(tipo, pagamento);
      const boletoUrl = texto(pagamento.bankSlipUrl, 2000);
      const faturaUrl = texto(pagamento.invoiceUrl, 2000);
      const descricao = texto(pagamento.description, 500);

      const existente = await tx.fatura.findUnique({
        where: { empresaId_asaasPaymentId: { empresaId: config.empresaId, asaasPaymentId } },
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
          },
        });
        return;
      }

      const customer = texto(pagamento.customer, 80);
      if (!customer || !valor || !vencimentoValido) return;
      const cliente = await tx.cliente.findFirst({
        where: { empresaId: config.empresaId, asaasCustomerId: customer },
        select: { id: true },
      });
      if (!cliente) return;

      await tx.fatura.create({
        data: {
          empresaId: config.empresaId,
          clienteId: cliente.id,
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
    });
    return { duplicado: false as const };
  } catch (erro) {
    if (conflitoDeEvento(erro)) return { duplicado: true as const };
    throw erro;
  }
}
