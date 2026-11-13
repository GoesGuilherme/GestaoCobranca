export type SituacaoPublicaPix = "Em aberto" | "Vencida" | "Paga" | "Cancelada";

export function situacaoPublicaPix(
  status: string,
  vencimentoIso: string,
  hojeIso: string,
  excluida: boolean,
): SituacaoPublicaPix {
  if (excluida) return "Cancelada";
  const bruto = status.trim().toUpperCase();
  if (bruto === "CANCELADA" || bruto === "CANCELADO") return "Cancelada";
  if (bruto === "PAGA" || bruto === "RECEIVED") return "Paga";
  if (bruto === "VENCIDA" || ((bruto === "EM_ABERTO" || bruto === "PENDENTE") && vencimentoIso < hojeIso)) {
    return "Vencida";
  }
  return "Em aberto";
}
