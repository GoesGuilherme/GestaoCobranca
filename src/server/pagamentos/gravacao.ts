import { statusNormalizado } from "@/lib/status-pagamento";

// Escrita dupla da transição: asaas_* continua e os campos do provedor
// (provedor, id externo, status normalizado) nascem juntos.

export function espelhoFaturaAsaas(dados: { status?: string; asaasPaymentId?: string | null }) {
  return {
    provedor: "ASAAS" as const,
    ...(dados.status !== undefined ? { statusNormalizado: statusNormalizado(dados.status) } : {}),
    ...(dados.asaasPaymentId !== undefined ? { idExterno: dados.asaasPaymentId } : {}),
  };
}

export function espelhoClienteAsaas(id: string) {
  return { asaasCustomerId: id, idExterno: id };
}

export function espelhoAssinaturaAsaas(id: string) {
  return { asaasSubscriptionId: id, idAssinaturaExterna: id };
}

export function espelhoFaturaCora(dados: { status?: string; idExterno?: string | null }) {
  return {
    provedor: "CORA" as const,
    ...(dados.status !== undefined ? { statusNormalizado: statusNormalizado(dados.status, "CORA") } : {}),
    ...(dados.idExterno !== undefined ? { idExterno: dados.idExterno } : {}),
  };
}

export function espelhoFaturaPix(dados: { status?: string; idExterno?: string | null }) {
  return {
    provedor: "PIX_DIRETO" as const,
    ...(dados.status !== undefined ? { statusNormalizado: statusNormalizado(dados.status, "PIX_DIRETO") } : {}),
    ...(dados.idExterno !== undefined ? { idExterno: dados.idExterno } : {}),
  };
}

export function espelhoFaturaInter(dados: { status?: string; idExterno?: string | null }) {
  return {
    provedor: "INTER" as const,
    ...(dados.status !== undefined ? { statusNormalizado: statusNormalizado(dados.status, "INTER") } : {}),
    ...(dados.idExterno !== undefined ? { idExterno: dados.idExterno } : {}),
  };
}
