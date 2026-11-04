import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { Prisma } from "@/generated/prisma/client";
import { logAsaasErro } from "@/server/asaas/log";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { CAPACIDADES_ASAAS } from "@/server/pagamentos/capacidades";
import { confirmarEventoParaBaixa } from "@/server/pagamentos/baixa";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import { normalizarWebhookAsaas, sinalAsaasConfirmaPagamento } from "@/server/pagamentos/webhook-asaas";
import { espelharPagamentoAsaas } from "./asaas-pagamento";
import { conciliarPromessas } from "./promessa-service";
import { enfileirarPagoWhatsapp } from "./whatsapp-fila";

function brutoJson(valor: unknown): Prisma.InputJsonValue | undefined {
  try {
    return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

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

function idEventoSeguro(corpo: unknown): string {
  if (!corpo || typeof corpo !== "object" || !("id" in corpo)) return "";
  const id = (corpo as { id?: unknown }).id;
  if (typeof id !== "string") return "";
  const limpo = id.trim();
  if (!limpo || limpo.length > 200) return "";
  return limpo;
}

function recusarWebhook(motivo: "ausente" | "nao_confere", corpo: unknown): never {
  logAsaasErro("webhook_recusado", { motivo, evento: idEventoSeguro(corpo) });
  throw new ErroAplicacao("Token do webhook recusado.", 401, "webhook_recusado");
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

// Mesma gravação do webhook: espelha a cobrança e, na passagem para paga,
// enfileira o WhatsApp de pagamento confirmado. A chave da fila impede segundo envio.
export async function aplicarPagamentoAsaas(
  tx: Prisma.TransactionClient,
  empresaId: string,
  pagamento: Record<string, unknown>,
  tipo: string,
) {
  const efeito = await espelharPagamentoAsaas(tx, empresaId, pagamento, tipo);
  if (!sinalAsaasConfirmaPagamento(tipo, pagamento)) return efeito;
  const asaasPaymentId = texto(pagamento.id, 80);
  if (!asaasPaymentId) return efeito;
  const fatura = await tx.fatura.findFirst({
    where: { empresaId, asaasPaymentId, excluida: false },
    include: { cliente: true },
  });
  if (!fatura) return efeito;
  const regua = await tx.configuracaoRegua.findUnique({ where: { empresaId } });
  await enfileirarPagoWhatsapp(tx, fatura, regua?.modoTeste ?? true);
  return efeito;
}

export async function processarWebhookAsaas(token: string | null, corpo: unknown) {
  const recebido = token?.trim() ?? "";
  if (!recebido) recusarWebhook("ausente", corpo);
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
    recusarWebhook("nao_confere", corpo);
  }

  const pagamento =
    evento.payment && typeof evento.payment === "object" ? (evento.payment as Record<string, unknown>) : null;
  const normalizado = normalizarWebhookAsaas(corpo);
  if (!normalizado) {
    throw new ErroAplicacao("Evento do Asaas inválido.", 400, "webhook_invalido");
  }
  const confirmado = await confirmarEventoParaBaixa(
    {
      capacidades: () => CAPACIDADES_ASAAS,
      async consultarCobranca(idExterno: string) {
        const provedor = await provedorDaEmpresa(config.empresaId);
        return provedor.consultarCobranca(idExterno);
      },
    },
    normalizado,
  );
  if (!confirmado.baixar) return { duplicado: false as const };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventoAsaas.create({
        data: { empresaId: config.empresaId, asaasEventId, tipo },
      });
      await tx.eventoPagamento.create({
        data: {
          empresaId: config.empresaId,
          provedor: "ASAAS",
          idEventoExterno: asaasEventId,
          idExterno: normalizado.idExterno,
          tipo,
          statusNormalizado: normalizado.status,
          bruto: brutoJson(corpo),
        },
      });
      if (normalizado.visualizacao) {
        await marcarFaturaVisualizada(tx, config.empresaId, pagamento, instanteVisualizacao(evento.dateCreated));
        return;
      }
      if (!normalizado.alteraCobranca || !pagamento) return;

      await aplicarPagamentoAsaas(tx, config.empresaId, pagamento, tipo);
    });
    if (normalizado.alteraCobranca) {
      await conciliarPromessas(config.empresaId);
    }
    return { duplicado: false as const };
  } catch (erro) {
    if (conflitoDeEvento(erro)) return { duplicado: true as const };
    throw erro;
  }
}
