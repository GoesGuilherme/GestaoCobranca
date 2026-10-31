import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { espelharPagamentoAsaas } from "./asaas-pagamento";
import { enfileirarPagoWhatsapp, eventoConfirmaPagamento } from "./whatsapp-fila";

// Página da fatura e PDF do boleto. Não mudam o status nem disparam mensagem.
const EVENTOS_VISUALIZACAO = new Set(["PAYMENT_CHECKOUT_VIEWED", "PAYMENT_BANK_SLIP_VIEWED"]);

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

function idPagamento(pagamento: Record<string, unknown> | null): string | null {
  if (!pagamento) return null;
  const id = texto(pagamento.id, 80);
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return id;
}

// O Asaas manda dateCreated sem fuso, no horário de Brasília (UTC-3, sem horário de verão).
function instanteVisualizacao(valor: unknown): Date {
  if (typeof valor !== "string") return new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(valor.trim());
  if (!match) return new Date();
  const data = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}-03:00`);
  return Number.isNaN(data.getTime()) ? new Date() : data;
}

async function marcarFaturaVisualizada(
  tx: Prisma.TransactionClient,
  empresaId: string,
  pagamento: Record<string, unknown> | null,
  quando: Date,
) {
  const asaasPaymentId = idPagamento(pagamento);
  if (!asaasPaymentId) return;
  await tx.fatura.updateMany({
    where: { empresaId, asaasPaymentId, visualizada: false },
    data: { visualizada: true, visualizadaEm: quando },
  });
}

export async function processarWebhookAsaas(token: string | null, corpo: unknown) {
  const recebido = token?.trim() ?? "";
  if (!recebido) {
    throw new ErroAplicacao("Token do webhook recusado.", 401, "webhook_recusado");
  }
  if (!corpo || typeof corpo !== "object") {
    throw new ErroAplicacao("Evento do Asaas inválido.", 400, "webhook_invalido");
  }

  const evento = corpo as { id?: unknown; event?: unknown; payment?: unknown; dateCreated?: unknown };
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
      if (EVENTOS_VISUALIZACAO.has(tipo)) {
        await marcarFaturaVisualizada(tx, config.empresaId, pagamento, instanteVisualizacao(evento.dateCreated));
        return;
      }
      if (!pagamento || !tipo.startsWith("PAYMENT_")) return;

      await espelharPagamentoAsaas(tx, config.empresaId, pagamento, tipo);
      if (eventoConfirmaPagamento(tipo, pagamento)) {
        const asaasPaymentId = texto(pagamento.id, 80);
        if (asaasPaymentId) {
          const fatura = await tx.fatura.findFirst({
            where: { empresaId: config.empresaId, asaasPaymentId, excluida: false },
            include: { cliente: true },
          });
          if (fatura) {
            const regua = await tx.configuracaoRegua.findUnique({ where: { empresaId: config.empresaId } });
            await enfileirarPagoWhatsapp(tx, fatura, regua?.modoTeste ?? true);
          }
        }
      }
    });
    return { duplicado: false as const };
  } catch (erro) {
    if (conflitoDeEvento(erro)) return { duplicado: true as const };
    throw erro;
  }
}
