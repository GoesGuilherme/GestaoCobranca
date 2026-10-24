import type {
  AmbienteAsaas,
  FormaCobranca,
  PapelUsuario,
  RecorrenciaServico,
  Segmento,
  SituacaoFatura,
  StatusCliente,
  StatusEmpresa,
  StatusFilial,
  StatusServicoCliente,
} from "./tipos";

export const SEGMENTOS: { valor: Segmento; rotulo: string }[] = [
  { valor: "RESTAURANTE", rotulo: "Restaurante" },
  { valor: "MERCADO_AUTONOMO", rotulo: "Mercado autônomo" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export const STATUS_CLIENTE: { valor: StatusCliente; rotulo: string }[] = [
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "INATIVO", rotulo: "Inativo" },
  { valor: "EM_IMPLANTACAO", rotulo: "Em implantação" },
];

export const STATUS_FILIAL: { valor: StatusFilial; rotulo: string }[] = [
  { valor: "ATIVA", rotulo: "Ativa" },
  { valor: "INATIVA", rotulo: "Inativa" },
  { valor: "EM_IMPLANTACAO", rotulo: "Em implantação" },
];

export function rotuloSegmento(valor: Segmento): string {
  return SEGMENTOS.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloStatusCliente(valor: StatusCliente): string {
  return STATUS_CLIENTE.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloStatusFilial(valor: StatusFilial): string {
  return STATUS_FILIAL.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export const STATUS_EMPRESA: { valor: StatusEmpresa; rotulo: string }[] = [
  { valor: "ATIVA", rotulo: "Ativa" },
  { valor: "SUSPENSA", rotulo: "Suspensa" },
];

export const PAPEIS: { valor: PapelUsuario; rotulo: string }[] = [
  { valor: "DONO", rotulo: "Dono" },
  { valor: "FINANCEIRO", rotulo: "Financeiro" },
  { valor: "SUPORTE", rotulo: "Suporte" },
];

export function rotuloStatusEmpresa(valor: StatusEmpresa): string {
  return STATUS_EMPRESA.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloPapel(valor: PapelUsuario): string {
  return PAPEIS.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export const RECORRENCIAS: { valor: RecorrenciaServico; rotulo: string }[] = [
  { valor: "MENSAL", rotulo: "Mensal" },
  { valor: "AVULSO", rotulo: "Avulso" },
];

export const STATUS_SERVICO_CLIENTE: { valor: StatusServicoCliente; rotulo: string }[] = [
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "INATIVO", rotulo: "Inativo" },
];

export function rotuloRecorrencia(valor: RecorrenciaServico): string {
  return RECORRENCIAS.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloStatusServicoCliente(valor: StatusServicoCliente): string {
  return STATUS_SERVICO_CLIENTE.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export const AMBIENTES_ASAAS: { valor: AmbienteAsaas; rotulo: string }[] = [
  { valor: "SANDBOX", rotulo: "Sandbox" },
  { valor: "PRODUCAO", rotulo: "Produção" },
];

export const FORMAS_COBRANCA: { valor: FormaCobranca; rotulo: string }[] = [
  { valor: "BOLETO", rotulo: "Boleto" },
  { valor: "PIX", rotulo: "Pix" },
  { valor: "CREDIT_CARD", rotulo: "Cartão de crédito" },
  { valor: "UNDEFINED", rotulo: "Cliente escolhe" },
];

export const SITUACOES_FATURA: { valor: SituacaoFatura; rotulo: string }[] = [
  { valor: "em_aberto", rotulo: "Em aberto" },
  { valor: "vencidas", rotulo: "Vencidas" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "canceladas", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
];

const STATUS_FATURA: Record<string, string> = {
  PENDING: "Em aberto",
  AWAITING_RISK_ANALYSIS: "Em análise",
  CONFIRMED: "Confirmada",
  RECEIVED: "Recebida",
  RECEIVED_IN_CASH: "Recebida em dinheiro",
  OVERDUE: "Vencida",
  DUNNING_REQUESTED: "Em negativação",
  DUNNING_RECEIVED: "Recebida após negativação",
  REFUNDED: "Estornada",
  REFUND_REQUESTED: "Estorno pedido",
  REFUND_IN_PROGRESS: "Estorno em andamento",
  CHARGEBACK_REQUESTED: "Chargeback",
  CHARGEBACK_DISPUTE: "Chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão",
};

export function rotuloAmbienteAsaas(valor: AmbienteAsaas): string {
  return AMBIENTES_ASAAS.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloFormaCobranca(valor: string): string {
  return FORMAS_COBRANCA.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloAssinatura(status: string): string {
  if (status === "ACTIVE") return "Recorrente";
  if (status === "INACTIVE") return "Pausada";
  if (status === "CANCELADA") return "Cancelada";
  if (status === "EXPIRED") return "Encerrada";
  return status;
}

export function rotuloCartao(status: string): string {
  if (status === "AGUARDANDO") return "Aguardando cadastro do cartão";
  if (status === "CADASTRADO") return "Cartão cadastrado";
  if (status === "RECUSADO") return "Cartão recusado";
  return status;
}

export function rotuloStatusFatura(status: string, excluida: boolean): string {
  if (excluida) return "Cancelada";
  return STATUS_FATURA[status] ?? status;
}

export function situacaoFatura(valor: string | undefined): SituacaoFatura {
  return SITUACOES_FATURA.some((item) => item.valor === valor) ? (valor as SituacaoFatura) : "em_aberto";
}
