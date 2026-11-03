import type { CobrancaNormalizada, EventoNormalizado, ProvedorPagamento } from "./tipos";
import { precisaReconsultarAntesDeBaixar } from "./capacidades";
import { STATUS_NORMALIZADO, type StatusNormalizado } from "@/lib/status-pagamento";

const BAIXA = new Set<StatusNormalizado>([
  STATUS_NORMALIZADO.PAGO,
  STATUS_NORMALIZADO.ESTORNADO,
  STATUS_NORMALIZADO.CANCELADO,
]);

export type ResultadoConfirmacao = {
  evento: EventoNormalizado;
  baixar: boolean;
  consultou: boolean;
};

function statusDeBaixa(status: StatusNormalizado | null): boolean {
  return status !== null && BAIXA.has(status);
}

// Provedor sem assinatura de webhook: a baixa usa o status consultado na API,
// não o corpo do POST. Se a consulta falha ou discorda, a cobrança não muda.
export async function confirmarEventoParaBaixa(
  provedor: Pick<ProvedorPagamento, "capacidades" | "consultarCobranca">,
  evento: EventoNormalizado,
): Promise<ResultadoConfirmacao> {
  if (!evento.alteraCobranca || !statusDeBaixa(evento.status)) {
    return { evento, baixar: true, consultou: false };
  }
  if (!precisaReconsultarAntesDeBaixar(provedor.capacidades())) {
    return { evento, baixar: true, consultou: false };
  }
  if (!evento.idExterno) return { evento, baixar: false, consultou: false };

  let atual: CobrancaNormalizada;
  try {
    atual = await provedor.consultarCobranca(evento.idExterno);
  } catch {
    return { evento, baixar: false, consultou: true };
  }
  if (atual.status !== evento.status) {
    return {
      evento: { ...evento, status: atual.status, statusBruto: atual.statusBruto },
      baixar: false,
      consultou: true,
    };
  }
  return { evento, baixar: true, consultou: true };
}
