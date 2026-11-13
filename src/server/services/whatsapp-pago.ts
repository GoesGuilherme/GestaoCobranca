import { dataPagamentoAsaas } from "@/server/asaas/data-pagamento";
import { prisma } from "@/server/db";
import { sinalAsaasConfirmaPagamento } from "@/server/pagamentos/webhook-asaas";
import { enfileirarPagoWhatsapp } from "./whatsapp-fila";

// Recuperação atrasada (conciliação depois de uma fila parada) não manda
// WhatsApp de pagamento. A data do Asaas é o dia, em Brasília, sem hora.
export const JANELA_WHATSAPP_PAGO_MS = 24 * 60 * 60 * 1000;

export function pagamentoDentroDaJanelaWhatsapp(
  pagamento: Record<string, unknown>,
  agora = new Date(),
): boolean {
  const iso = dataPagamentoAsaas(pagamento);
  if (!iso) return true;
  const inicio = new Date(`${iso}T00:00:00.000-03:00`);
  if (Number.isNaN(inicio.getTime())) return true;
  return agora.getTime() - inicio.getTime() <= JANELA_WHATSAPP_PAGO_MS;
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

// Fora de transação. A fila é idempotente pela chave wa:empresa:fatura:pago:PAGO.
export async function enfileirarPagoDoPagamento(
  empresaId: string,
  pagamento: Record<string, unknown>,
  tipo: string,
  agora = new Date(),
) {
  if (!sinalAsaasConfirmaPagamento(tipo, pagamento)) return;
  if (!pagamentoDentroDaJanelaWhatsapp(pagamento, agora)) return;
  const asaasPaymentId = texto(pagamento.id, 80);
  if (!asaasPaymentId) return;
  const fatura = await prisma.fatura.findFirst({
    where: { empresaId, asaasPaymentId, excluida: false },
    include: { cliente: true },
  });
  if (!fatura) return;
  const regua = await prisma.configuracaoRegua.findUnique({ where: { empresaId } });
  await enfileirarPagoWhatsapp(prisma, fatura, regua?.modoTeste ?? true, agora);
}
