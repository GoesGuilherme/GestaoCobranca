/**
 * Status da cobrança no vocabulário do Taguaro.
 *
 * PENDENTE  em aberto, ainda no prazo (ou em análise, no Asaas)
 * VENCIDA   passou do vencimento, ou foi para negativação
 * PAGA      dinheiro reconhecido
 * CANCELADA fatura excluída, ou o provedor avisou cancelamento
 * ESTORNADA dinheiro devolvido ou em disputa
 * CRIANDO   reserva local, ainda sem cobrança no provedor
 * FALHA     a emissão não completou
 * DESCONHECIDO  texto que este mapa não reconhece; não entra em aberto nem em pago
 *
 * A coluna `status` da fatura Asaas continua com o texto cru (RECEIVED, PENDING…).
 * A coluna `status_normalizado` e esta função são o que a régua, a promessa,
 * o selo e os painéis consultam. O gatilho SQL `status_normalizado_asaas`
 * repete este mapa: os dois precisam mudar juntos.
 */

export const STATUS_COBRANCA = [
  "CRIANDO",
  "PENDENTE",
  "VENCIDA",
  "PAGA",
  "CANCELADA",
  "ESTORNADA",
  "FALHA",
  "DESCONHECIDO",
] as const;

export type StatusCobranca = (typeof STATUS_COBRANCA)[number];

const NORMALIZADOS = new Set<string>(STATUS_COBRANCA);

/** Textos crus do Asaas que a API dele ainda recebe quando buscamos pago_em. A ordem importa para o retroativo. */
export const STATUS_BRUTOS_PAGOS_ASAAS = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] as const;

const PAGOS_ASAAS = new Set<string>(STATUS_BRUTOS_PAGOS_ASAAS);
const VENCIDOS_ASAAS = new Set(["OVERDUE", "DUNNING_REQUESTED"]);
const PENDENTES_ASAAS = new Set(["PENDING", "AWAITING_RISK_ANALYSIS"]);
const ESTORNOS_ASAAS = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

/**
 * Régua automática e envio manual só nestes dois textos do Asaas.
 * Análise de risco e negativação continuam de fora: já era assim.
 */
const REGUA_ASAAS = new Set(["PENDING", "OVERDUE"]);

export function normalizarStatus(status: string, provedor = "ASAAS"): StatusCobranca {
  const texto = status.trim().toUpperCase();
  if (NORMALIZADOS.has(texto)) return texto as StatusCobranca;
  if (provedor !== "ASAAS") return "DESCONHECIDO";
  return normalizarStatusAsaas(texto);
}

export function normalizarStatusAsaas(status: string): StatusCobranca {
  const texto = status.trim().toUpperCase();
  if (texto === "CRIANDO") return "CRIANDO";
  if (texto === "ERRO_EMISSAO") return "FALHA";
  if (PAGOS_ASAAS.has(texto)) return "PAGA";
  if (VENCIDOS_ASAAS.has(texto)) return "VENCIDA";
  if (PENDENTES_ASAAS.has(texto)) return "PENDENTE";
  if (ESTORNOS_ASAAS.has(texto)) return "ESTORNADA";
  return "DESCONHECIDO";
}

export function statusEfetivo(status: string, excluida: boolean, provedor = "ASAAS"): StatusCobranca {
  if (excluida) return "CANCELADA";
  return normalizarStatus(status, provedor);
}

export function faturaElegivelRegua(fatura: { status: string; excluida: boolean; provedor?: string | null }): boolean {
  if (fatura.excluida) return false;
  const provedor = fatura.provedor ?? "ASAAS";
  if (provedor === "ASAAS") return REGUA_ASAAS.has(fatura.status);
  const status = normalizarStatus(fatura.status, provedor);
  return status === "PENDENTE" || status === "VENCIDA";
}

export function filtroFaturasDaRegua() {
  return {
    excluida: false,
    OR: [
      { provedor: "ASAAS", status: { in: ["PENDING", "OVERDUE"] } },
      { NOT: { provedor: "ASAAS" }, statusNormalizado: { in: ["PENDENTE", "VENCIDA"] } },
    ],
  };
}

export function filtroListaFaturas(situacao: "todas" | "canceladas" | "vencidas" | "pagas" | "em_aberto") {
  if (situacao === "todas") return { statusNormalizado: { not: "CRIANDO" } };
  if (situacao === "canceladas") return { excluida: true, statusNormalizado: { not: "CRIANDO" } };
  if (situacao === "vencidas") return { excluida: false, statusNormalizado: "VENCIDA" };
  if (situacao === "pagas") return { excluida: false, statusNormalizado: "PAGA" };
  return { excluida: false, statusNormalizado: { in: ["PENDENTE", "VENCIDA"] } };
}

export function filtroAbertasOuVencidas() {
  return { excluida: false, statusNormalizado: { in: ["PENDENTE", "VENCIDA"] } };
}

export function filtroPagas() {
  return { excluida: false, statusNormalizado: "PAGA" };
}
