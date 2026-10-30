import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { espelharPagamentoAsaas } from "./asaas-pagamento";
import { enfileirarPagoWhatsapp, eventoConfirmaPagamento } from "./whatsapp-fila";

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
