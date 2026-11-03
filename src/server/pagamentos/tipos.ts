import type { StatusNormalizado } from "@/lib/status-pagamento";
import type { ProvedorCodigo } from "@/lib/status-pagamento";

export type { ProvedorCodigo, StatusNormalizado };

export type Capacidades = {
  boleto: boolean;
  boletoComPix: boolean;
  pixComVencimento: boolean;
  cartao: boolean;
  assinaturaNativa: boolean;
  pixAutomatico: boolean;
  visualizacao: boolean;
  precisaClienteRemoto: boolean;
  editarVencimento: boolean;
  // Token, HMAC ou outro segredo que autentica o remetente.
  // Sem isso, a baixa só acontece depois de consultar a cobrança no provedor.
  webhookAssinado: boolean;
};

export type FormaCobrancaProvedor = "BOLETO" | "PIX" | "BOLETO_PIX" | "CARTAO" | "INDEFINIDA";

export type MeioPagamento = "BOLETO" | "PIX" | "CARTAO";

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
  valor: string;
  vencimento: string;
  statusBruto: string;
  status: StatusNormalizado | null;
  formaCobranca: string;
  meio: MeioPagamento | null;
  boletoUrl: string | null;
  faturaUrl: string | null;
  descricao: string | null;
  excluida: boolean;
  pagoEm: string | null;
};

export type PaginaCobrancas = {
  cobrancas: CobrancaNormalizada[];
  temMais: boolean;
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
  status?: "ATIVA" | "PAUSADA";
  atualizarPendentes?: boolean;
  encargos?: EncargosCobranca;
};

export type AssinaturaNormalizada = {
  idExterno: string;
  idClienteExterno: string;
  valor: string;
  proximoVencimento: string;
  statusBruto: string;
  situacao: "ATIVA" | "PAUSADA" | "CANCELADA" | "OUTRA";
  formaCobranca: string;
  descricao: string | null;
};

export type EventoNormalizado = {
  idEvento: string;
  idExterno: string | null;
  tipo: string;
  status: StatusNormalizado | null;
  statusBruto: string | null;
  pagoEm: string | null;
  valor: string | null;
  meio: MeioPagamento | null;
  visualizacao: boolean;
  alteraCobranca: boolean;
  confirmaPagamento: boolean;
  bruto: unknown;
};

export type EntradaWebhook = {
  headers: Headers;
  corpo: unknown;
};

export interface ProvedorPagamento {
  readonly provedor: ProvedorCodigo;
  capacidades(): Capacidades;
  testarConexao(): Promise<{ titular: string }>;
  criarCobranca(dados: NovaCobranca): Promise<CobrancaNormalizada>;
  consultarCobranca(idExterno: string): Promise<CobrancaNormalizada>;
  cancelarCobranca(idExterno: string, motivo?: string): Promise<void>;
  editarCobranca?(idExterno: string, dados: { valor?: string; vencimento?: string }): Promise<void>;
  listarCobrancas?(filtro: { statusBruto?: string; offset: number; limit: number }): Promise<PaginaCobrancas>;
  normalizarWebhook(entrada: EntradaWebhook): Promise<EventoNormalizado[]>;
  criarAssinatura?(dados: NovaAssinatura): Promise<AssinaturaNormalizada>;
  atualizarAssinatura?(idExterno: string, dados: AtualizacaoAssinatura): Promise<AssinaturaNormalizada>;
  cancelarAssinatura?(idExterno: string): Promise<void>;
}
