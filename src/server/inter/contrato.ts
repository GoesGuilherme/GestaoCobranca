import type { AmbientePagamento } from "@/server/pagamentos/credenciais";
import type { EncargosCobranca, PagadorCobranca } from "@/server/pagamentos/tipos";

export const ESCOPO_COBRANCA_INTER = "boleto-cobranca.read boleto-cobranca.write";
export const DIAS_AGENDA_INTER = 60;

export type SituacaoInter =
  | "RECEBIDO"
  | "A_RECEBER"
  | "MARCADO_RECEBIDO"
  | "ATRASADO"
  | "CANCELADO"
  | "EXPIRADO"
  | "FALHA_EMISSAO"
  | "EM_PROCESSAMENTO"
  | "PROTESTO";

export type CobrancaInter = {
  codigoSolicitacao: string;
  seuNumero: string;
  situacao: string;
  dataVencimento: string;
  dataSituacao: string | null;
  valorNominal: string;
  valorTotalRecebido: string | null;
  origemRecebimento: "BOLETO" | "PIX" | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  pixCopiaCola: string | null;
  descricao: string | null;
};

export type NovaCobrancaInter = {
  seuNumero: string;
  valorNominal: string;
  dataVencimento: string;
  pagador: PagadorCobranca;
  descricao?: string;
  encargos?: EncargosCobranca;
};

export type FiltroCobrancasInter = {
  dataInicial: string;
  dataFinal: string;
  seuNumero?: string;
  situacao?: string;
  pagina: number;
  itensPorPagina: number;
};

export type PaginaCobrancasInter = {
  cobrancas: CobrancaInter[];
  temMais: boolean;
};

export type CredenciaisInter = {
  ambiente: AmbientePagamento;
  clientId: string;
  clientSecret: string;
  certificadoPem: string;
  chavePrivadaPem: string;
  contaCorrente?: string;
};

export interface ClienteHttpInter {
  testarConexao(): Promise<{ titular: string }>;
  criarCobranca(dados: NovaCobrancaInter): Promise<CobrancaInter>;
  consultarCobranca(codigoSolicitacao: string): Promise<CobrancaInter>;
  buscarPorSeuNumero(seuNumero: string, vencimento: string): Promise<CobrancaInter | null>;
  cancelarCobranca(codigoSolicitacao: string, motivo: string): Promise<void>;
  editarCobranca(codigoSolicitacao: string, dados: { valor?: string; vencimento?: string }): Promise<void>;
  obterPdf(codigoSolicitacao: string): Promise<string>;
  listarCobrancas(filtro: FiltroCobrancasInter): Promise<PaginaCobrancasInter>;
  registrarWebhook(url: string): Promise<void>;
}
