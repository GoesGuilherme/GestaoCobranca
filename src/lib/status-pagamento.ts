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

export const PROVEDORES_PAGAMENTO = ["ASAAS", "CORA", "INTER", "EFI", "SICOOB", "SICREDI"] as const;

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

const MAPAS: Record<ProvedorCodigo, readonly RegistroStatus[]> = {
  ASAAS: MAPA_ASAAS,
  // Os outros bancos entram com o próprio mapa. Enquanto o conector não existe, a lista fica vazia.
  CORA: [],
  INTER: [],
  EFI: [],
  SICOOB: [],
  SICREDI: [],
};

function registros(provedor: ProvedorCodigo): readonly RegistroStatus[] {
  return MAPAS[provedor];
}

export function provedorCodigo(valor: string | null | undefined): ProvedorCodigo {
  if (valor && (PROVEDORES_PAGAMENTO as readonly string[]).includes(valor)) return valor as ProvedorCodigo;
  return "ASAAS";
}

export function statusNormalizado(statusBruto: string, provedor: ProvedorCodigo = "ASAAS"): StatusNormalizado | null {
  const bruto = statusBruto.trim().toUpperCase();
  return registros(provedor).find((item) => item.bruto === bruto)?.normalizado ?? null;
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
