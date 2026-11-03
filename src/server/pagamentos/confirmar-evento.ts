import type { EventoNormalizado, ProvedorPagamento, ResultadoConfirmacao } from "./contrato";

/**
 * Provedor sem assinatura de webhook (Cora, Sicredi) não dá baixa no que o
 * POST contou. Consultamos a cobrança e só seguimos se o status bater.
 * Pagamento exige que a consulta também diga PAGA.
 * O Asaas não passa por aqui: confirmarBaixaPorConsulta é false.
 */
export async function confirmarEventoAntesDaBaixa(
  provedor: ProvedorPagamento,
  evento: EventoNormalizado,
): Promise<ResultadoConfirmacao> {
  if (!provedor.capacidades().confirmarBaixaPorConsulta || evento.visualizacao) {
    return { recusado: false, evento };
  }
  if (!evento.idExterno) return { recusado: true, motivo: "sem_id" };
  try {
    const cobranca = await provedor.consultarCobranca(evento.idExterno);
    if (evento.status === "PAGA" && cobranca.status !== "PAGA") {
      return { recusado: true, motivo: "consulta_nao_confirma" };
    }
    if (evento.status && cobranca.status !== evento.status && evento.status === "PAGA") {
      return { recusado: true, motivo: "consulta_nao_confirma" };
    }
    const pagoEm = cobranca.pagoEm ? new Date(`${cobranca.pagoEm}T00:00:00.000Z`) : evento.pagoEm;
    return {
      recusado: false,
      evento: {
        ...evento,
        status: cobranca.status,
        statusBruto: cobranca.statusBruto,
        pagoEm,
        excluida: cobranca.excluida || evento.excluida,
      },
    };
  } catch {
    return { recusado: true, motivo: "consulta_falhou" };
  }
}
