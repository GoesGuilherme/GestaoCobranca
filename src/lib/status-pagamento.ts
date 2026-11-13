// Status da cobrança no vocabulário do Taguaro.
// A coluna `faturas.status` continua com o texto do provedor (RECEIVED no Asaas).
// Régua, promessa, selo e painéis leem o status normalizado, não essa string.

export const STATUS_NORMALIZADO = {
  CRIANDO: "CRIANDO",
  PENDENTE: "PENDENTE",
  VENCIDO: "VENCIDO",
  PAGO: "PAGO",
  CANCELADO: "CANCELADO",
  ESTORNADO: "ESTORNADO",
  FALHA: "FALHA",
} as const;

export type StatusNormalizado = (typeof STATUS_NORMALIZADO)[keyof typeof STATUS_NORMALIZADO];

export const PROVEDORES_PAGAMENTO = ["ASAAS", "CORA", "INTER", "EFI", "SICOOB", "SICREDI", "PIX_DIRETO"] as const;

export type ProvedorCodigo = (typeof PROVEDORES_PAGAMENTO)[number];

export type GrupoStatus =
  | StatusNormalizado
  | "REGUA_ABERTA"
  | "RECORRENCIA_ABERTA";

type RegistroStatus = {
  bruto: string;
  normalizado: StatusNormalizado;
  regua: boolean;
  recorrencia: boolean;
};

// A ordem de cada grupo repete as listas que os painéis já usavam.
const MAPA_ASAAS: readonly RegistroStatus[] = [
  { bruto: "PENDING", normalizado: "PENDENTE", regua: true, recorrencia: true },
  { bruto: "AWAITING_RISK_ANALYSIS", normalizado: "PENDENTE", regua: false, recorrencia: true },
  { bruto: "OVERDUE", normalizado: "VENCIDO", regua: true, recorrencia: true },
  { bruto: "DUNNING_REQUESTED", normalizado: "VENCIDO", regua: false, recorrencia: true },
  { bruto: "RECEIVED", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "CONFIRMED", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "RECEIVED_IN_CASH", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "DUNNING_RECEIVED", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "REFUNDED", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "REFUND_REQUESTED", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "REFUND_IN_PROGRESS", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "CHARGEBACK_REQUESTED", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "CHARGEBACK_DISPUTE", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "AWAITING_CHARGEBACK_REVERSAL", normalizado: "ESTORNADO", regua: false, recorrencia: false },
  { bruto: "CRIANDO", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "ERRO_EMISSAO", normalizado: "FALHA", regua: false, recorrencia: false },
];

// Cobrança v3 (bolepix). EXPIRADO encerra o título depois de numDiasAgenda: não entra na régua.
// PROTESTO continua cobrável. Não há estorno nesta API.
// Fatura da Cora (boleto v2). CANCELLED é o texto da API; CANCELED entra por tolerância.
// IN_PAYMENT ainda não é pagamento confirmado: a régua espera, a recorrência não emite outra.
const MAPA_CORA: readonly RegistroStatus[] = [
  { bruto: "DRAFT", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "RECURRENCE_DRAFT", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "CRIANDO", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "OPEN", normalizado: "PENDENTE", regua: true, recorrencia: true },
  { bruto: "IN_PAYMENT", normalizado: "PENDENTE", regua: false, recorrencia: true },
  { bruto: "LATE", normalizado: "VENCIDO", regua: true, recorrencia: true },
  { bruto: "PAID", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "CANCELLED", normalizado: "CANCELADO", regua: false, recorrencia: false },
  { bruto: "CANCELED", normalizado: "CANCELADO", regua: false, recorrencia: false },
  { bruto: "ERRO_EMISSAO", normalizado: "FALHA", regua: false, recorrencia: false },
];

// Pix por chave própria. PAGA é o texto gravado na baixa manual.
// RECEIVED entra como alias e também normaliza para PAGO, o grupo do Taguaro.
const MAPA_PIX_DIRETO: readonly RegistroStatus[] = [
  { bruto: "CRIANDO", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "EM_ABERTO", normalizado: "PENDENTE", regua: true, recorrencia: true },
  { bruto: "VENCIDA", normalizado: "VENCIDO", regua: true, recorrencia: true },
  { bruto: "PAGA", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "RECEIVED", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "CANCELADA", normalizado: "CANCELADO", regua: false, recorrencia: false },
];

const MAPA_INTER: readonly RegistroStatus[] = [
  { bruto: "EM_PROCESSAMENTO", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "CRIANDO", normalizado: "CRIANDO", regua: false, recorrencia: false },
  { bruto: "A_RECEBER", normalizado: "PENDENTE", regua: true, recorrencia: true },
  { bruto: "ATRASADO", normalizado: "VENCIDO", regua: true, recorrencia: true },
  { bruto: "PROTESTO", normalizado: "VENCIDO", regua: true, recorrencia: true },
  { bruto: "RECEBIDO", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "MARCADO_RECEBIDO", normalizado: "PAGO", regua: false, recorrencia: false },
  { bruto: "CANCELADO", normalizado: "CANCELADO", regua: false, recorrencia: false },
  { bruto: "EXPIRADO", normalizado: "CANCELADO", regua: false, recorrencia: false },
  { bruto: "FALHA_EMISSAO", normalizado: "FALHA", regua: false, recorrencia: false },
  { bruto: "ERRO_EMISSAO", normalizado: "FALHA", regua: false, recorrencia: false },
];

const MAPAS: Record<ProvedorCodigo, readonly RegistroStatus[]> = {
  ASAAS: MAPA_ASAAS,
  CORA: MAPA_CORA,
  INTER: MAPA_INTER,
  EFI: [],
  SICOOB: [],
  SICREDI: [],
  PIX_DIRETO: MAPA_PIX_DIRETO,
};

function registros(provedor: ProvedorCodigo): readonly RegistroStatus[] {
  return MAPAS[provedor];
}

export function provedorCodigo(valor: string | null | undefined): ProvedorCodigo {
  if (valor && (PROVEDORES_PAGAMENTO as readonly string[]).includes(valor)) return valor as ProvedorCodigo;
  return "ASAAS";
}

function registroDe(provedor: ProvedorCodigo, bruto: string): RegistroStatus | undefined {
  return registros(provedor).find((item) => item.bruto === bruto);
}

export function statusNormalizado(statusBruto: string, provedor: ProvedorCodigo = "ASAAS"): StatusNormalizado | null {
  const bruto = statusBruto.trim().toUpperCase();
  const direto = registroDe(provedor, bruto);
  if (direto) return direto.normalizado;
  // Quem já informa o provedor não mistura mapas. O padrão Asaas só cai no
  // mapa de outro banco quando a string não é do Asaas (A_RECEBER, RECEBIDO…).
  // Nenhuma situação do Asaas muda de grupo por causa disso.
  if (provedor !== "ASAAS") return null;
  for (const codigo of PROVEDORES_PAGAMENTO) {
    if (codigo === "ASAAS") continue;
    const outro = registroDe(codigo, bruto);
    if (outro) return outro.normalizado;
  }
  return null;
}

export function statusBrutos(grupo: GrupoStatus, provedor: ProvedorCodigo = "ASAAS"): readonly string[] {
  return registros(provedor)
    .filter((item) => {
      if (grupo === "REGUA_ABERTA") return item.regua;
      if (grupo === "RECORRENCIA_ABERTA") return item.recorrencia;
      return item.normalizado === grupo;
    })
    .map((item) => item.bruto);
}

export function statusEh(statusBruto: string, grupo: GrupoStatus, provedor: ProvedorCodigo = "ASAAS"): boolean {
  const bruto = statusBruto.trim().toUpperCase();
  return statusBrutos(grupo, provedor).some((item) => item === bruto);
}

export function statusIgnoradoNoSelo(statusBruto: string, provedor: ProvedorCodigo = "ASAAS"): boolean {
  const normalizado = statusNormalizado(statusBruto, provedor);
  return normalizado === "ESTORNADO" || normalizado === "CRIANDO" || normalizado === "FALHA";
}
