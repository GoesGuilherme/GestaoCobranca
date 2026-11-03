import type { StatusCobranca } from "@/lib/status-cobranca";

/**
 * Provedores que o Taguaro sabe nomear. Só ASAAS emite nesta etapa.
 * O próximo conector é a Cora: sem assinatura nativa e sem assinatura de
 * webhook, então a baixa só acontece depois de consultar a cobrança.
 */
export const PROVEDORES = [
  "ASAAS",
  "CORA",
  "INTER",
  "EFI",
  "SICOOB",
  "SICREDI",
  "BB",
  "ITAU",
  "BRADESCO",
  "SANTANDER",
  "MERCADO_PAGO",
  "PAGBANK",
  "IUGU",
] as const;

export type ProvedorId = (typeof PROVEDORES)[number];

export const PROVEDORES_DISPONIVEIS = ["ASAAS"] as const;

export type MeioCobranca = "BOLETO" | "PIX" | "BOLETO_PIX" | "CARTAO";

export type FormaCobrancaProvedor = "BOLETO" | "PIX" | "UNDEFINED" | "CREDIT_CARD" | "BOLETO_PIX";

export type CapacidadesProvedor = {
  boleto: boolean;
  boletoComPix: boolean;
  pixComVencimento: boolean;
  cartao: boolean;
  /** Asaas, Efí, Iugu, Mercado Pago e PagBank. Banco tradicional fica false e a recorrência é do Taguaro. */
  assinaturaNativa: boolean;
  pixAutomatico: boolean;
  /** Só o Asaas avisa que o pagador abriu o boleto. */
  visualizacao: boolean;
  /** Asaas exige um customer antes da cobrança. */
  precisaClienteRemoto: boolean;
  editarVencimento: boolean;
  /** HMAC ou assinatura do corpo. Token compartilhado não conta. */
  webhookAssinado: boolean;
  /**
   * Quando true, o webhook não dá baixa sozinho: a cobrança é consultada de
   * novo no provedor e só entra como paga se a consulta concordar.
   * Asaas fica false para não mudar o fluxo de quem já usa.
   * Cora e Sicredi precisam de true.
   */
  confirmarBaixaPorConsulta: boolean;
};

export type EncargosCobranca = {
  multaPercentual?: string | null;
  jurosPercentual?: string | null;
  descontoPercentual?: string | null;
  descontoDiasAntes?: number | null;
};

export type NovaCobranca = {
  idClienteExterno: string;
  formaCobranca: FormaCobrancaProvedor;
  valor: string;
  vencimento: string;
  descricao?: string;
  chaveIdempotencia: string;
  encargos?: EncargosCobranca;
};

export type CobrancaNormalizada = {
  idExterno: string;
  idClienteExterno: string | null;
  idAssinaturaExterna: string | null;
  status: StatusCobranca;
  statusBruto: string;
  valor: string;
  vencimento: string;
  pagoEm: string | null;
  meio: MeioCobranca | null;
  boletoUrl: string | null;
  faturaUrl: string | null;
  descricao: string | null;
  excluida: boolean;
  chaveIdempotencia: string | null;
  bruto: unknown;
};

export type NovaAssinatura = {
  idClienteExterno: string;
  formaCobranca: FormaCobrancaProvedor;
  valor: string;
  proximoVencimento: string;
  descricao?: string;
  chaveIdempotencia: string;
  encargos?: EncargosCobranca;
};

export type AtualizacaoAssinatura = {
  formaCobranca?: FormaCobrancaProvedor;
  valor?: string;
  proximoVencimento?: string;
  descricao?: string;
  status?: "ACTIVE" | "INACTIVE";
  atualizarPendentes?: boolean;
  encargos?: EncargosCobranca;
};

export type AssinaturaNormalizada = {
  idExterno: string;
  idClienteExterno: string | null;
  valor: string;
  proximoVencimento: string;
  statusBruto: string;
  formaCobranca: string;
  descricao: string | null;
  bruto: unknown;
};

export type PaginaCobrancas = {
  cobrancas: CobrancaNormalizada[];
  temMais: boolean;
};

export type EventoNormalizado = {
  idEvento: string;
  tipo: string;
  idExterno: string | null;
  status: StatusCobranca | null;
  statusBruto: string | null;
  pagoEm: Date | null;
  valorPago: string | null;
  meio: MeioCobranca | null;
  visualizacao: boolean;
  excluida: boolean;
  bruto: unknown;
};

export type ResultadoConfirmacao =
  | { recusado: false; evento: EventoNormalizado }
  | { recusado: true; motivo: "sem_id" | "consulta_nao_confirma" | "consulta_falhou" };

export interface ProvedorPagamento {
  readonly provedor: ProvedorId;
  capacidades(): CapacidadesProvedor;
  testarConexao(): Promise<{ titular: string }>;
  criarCobranca(dados: NovaCobranca): Promise<CobrancaNormalizada>;
  consultarCobranca(idExterno: string): Promise<CobrancaNormalizada>;
  /** Idempotência da emissão. No Asaas é o externalReference. */
  buscarCobrancaPorIdempotencia?(chave: string): Promise<CobrancaNormalizada | null>;
  cancelarCobranca(idExterno: string, motivo?: string): Promise<void>;
  editarCobranca?(idExterno: string, dados: { valor?: string; vencimento?: string }): Promise<void>;
  obterLinhaDigitavel?(idExterno: string): Promise<string | null>;
  obterPix?(idExterno: string): Promise<string | null>;
  listarCobrancas?(filtro: { statusBruto?: string; offset: number; limit: number }): Promise<PaginaCobrancas>;
  normalizarWebhook(entrada: { headers: Headers; corpo: unknown }): Promise<EventoNormalizado[]>;
  criarAssinatura?(dados: NovaAssinatura): Promise<AssinaturaNormalizada>;
  buscarAssinaturaPorIdempotencia?(chave: string): Promise<AssinaturaNormalizada | null>;
  atualizarAssinatura?(idExterno: string, dados: AtualizacaoAssinatura): Promise<AssinaturaNormalizada>;
  cancelarAssinatura?(idExterno: string): Promise<void>;
  listarCobrancasDaAssinatura?(idExterno: string, offset: number, limit: number): Promise<PaginaCobrancas>;
}

export function provedorConhecido(valor: string): valor is ProvedorId {
  return (PROVEDORES as readonly string[]).includes(valor);
}

/** Banco sem assinatura nativa: o Taguaro gera a cobrança do mês. Ainda sem cron, de propósito. */
export function recorrenciaPeloTaguaro(capacidades: CapacidadesProvedor): boolean {
  return !capacidades.assinaturaNativa;
}
