import { STATUS_NORMALIZADO, statusNormalizado, type StatusNormalizado } from "./status-pagamento";
import type {
  AmbienteAsaas,
  FormaCobranca,
  PapelUsuario,
  RecorrenciaServico,
  Segmento,
  FiltroVisualizacao,
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
  { valor: "BLOQUEADO", rotulo: "Bloqueado" },
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

export const FILTROS_VISUALIZACAO: { valor: FiltroVisualizacao; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "vistas", rotulo: "Visualizadas" },
  { valor: "nao_vistas", rotulo: "Não visualizadas" },
];

// Rótulos que o selo já mostra para o Asaas, mais os do Inter que já estavam neste mapa.
// A coluna `faturas.status` continua com o texto do provedor.
const STATUS_ASAAS_E_INTER: Record<string, string> = {
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
  A_RECEBER: "Em aberto",
  ATRASADO: "Vencida",
  RECEBIDO: "Recebida",
  MARCADO_RECEBIDO: "Recebida",
  CANCELADO: "Cancelada",
  EXPIRADO: "Expirada",
  EM_PROCESSAMENTO: "Em emissão",
  FALHA_EMISSAO: "Falha na emissão",
  PROTESTO: "Em protesto",
  EM_ABERTO: "Em aberto",
  VENCIDA: "Vencida",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

const STATUS_INTERNO: Record<string, string> = {
  CRIANDO: STATUS_ASAAS_E_INTER.EM_PROCESSAMENTO,
  ERRO_EMISSAO: STATUS_ASAAS_E_INTER.FALHA_EMISSAO,
};

// Cora guarda OPEN/PAID/LATE. O selo reusa o rótulo já usado no mesmo papel.
// IN_PAYMENT ainda não liquidou: a régua espera, como em AWAITING_RISK_ANALYSIS.
// DRAFT e RECURRENCE_DRAFT ainda não são cobrança: o mesmo rótulo de EM_PROCESSAMENTO.
// O Asaas não tem status público para rascunho nem falha de emissão.
const STATUS_CORA: Record<string, string> = {
  OPEN: STATUS_ASAAS_E_INTER.PENDING,
  LATE: STATUS_ASAAS_E_INTER.OVERDUE,
  PAID: STATUS_ASAAS_E_INTER.RECEIVED,
  CANCELLED: STATUS_ASAAS_E_INTER.CANCELADO,
  CANCELED: STATUS_ASAAS_E_INTER.CANCELADO,
  IN_PAYMENT: STATUS_ASAAS_E_INTER.AWAITING_RISK_ANALYSIS,
  DRAFT: STATUS_ASAAS_E_INTER.EM_PROCESSAMENTO,
  RECURRENCE_DRAFT: STATUS_ASAAS_E_INTER.EM_PROCESSAMENTO,
};

const STATUS_FATURA: Record<string, string> = {
  ...STATUS_ASAAS_E_INTER,
  ...STATUS_INTERNO,
  ...STATUS_CORA,
};

// Grupo normalizado, quando o texto do provedor não tem entrada própria.
// PAGO cai em Recebida (RECEIVED), não em Confirmada.
const ROTULO_DO_GRUPO: Record<StatusNormalizado, string> = {
  [STATUS_NORMALIZADO.PENDENTE]: STATUS_ASAAS_E_INTER.PENDING,
  [STATUS_NORMALIZADO.VENCIDO]: STATUS_ASAAS_E_INTER.OVERDUE,
  [STATUS_NORMALIZADO.PAGO]: STATUS_ASAAS_E_INTER.RECEIVED,
  [STATUS_NORMALIZADO.CANCELADO]: STATUS_ASAAS_E_INTER.CANCELADO,
  [STATUS_NORMALIZADO.ESTORNADO]: STATUS_ASAAS_E_INTER.REFUNDED,
  [STATUS_NORMALIZADO.CRIANDO]: STATUS_ASAAS_E_INTER.EM_PROCESSAMENTO,
  [STATUS_NORMALIZADO.FALHA]: STATUS_ASAAS_E_INTER.FALHA_EMISSAO,
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
  const chave = status.trim().toUpperCase();
  const direto = STATUS_FATURA[chave];
  if (direto) return direto;
  const grupo = statusNormalizado(chave);
  if (grupo) return ROTULO_DO_GRUPO[grupo];
  return status.trim();
}

export function situacaoFatura(valor: string | undefined): SituacaoFatura {
  return SITUACOES_FATURA.some((item) => item.valor === valor) ? (valor as SituacaoFatura) : "em_aberto";
}

export function filtroVisualizacao(valor: string | undefined): FiltroVisualizacao {
  return FILTROS_VISUALIZACAO.some((item) => item.valor === valor) ? (valor as FiltroVisualizacao) : "todas";
}
