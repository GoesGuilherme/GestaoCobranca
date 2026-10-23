export const URL_ASAAS = {
  SANDBOX: "https://api-sandbox.asaas.com/v3",
  PRODUCAO: "https://api.asaas.com/v3",
} as const;

export type AmbienteAsaas = keyof typeof URL_ASAAS;

export type FormaCobranca = "BOLETO" | "PIX" | "UNDEFINED";

export type ClienteAsaas = {
  id: string;
  nome: string;
  cpfCnpj: string;
};

export type CobrancaAsaas = {
  id: string;
  customer: string;
  valor: string;
  vencimento: string;
  status: string;
  formaCobranca: string;
  boletoUrl: string | null;
  faturaUrl: string | null;
  descricao: string | null;
  excluida: boolean;
};

export type NovoClienteAsaas = {
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
  referencia?: string;
};

export type NovaCobrancaAsaas = {
  customer: string;
  formaCobranca: FormaCobranca;
  valor: string;
  vencimento: string;
  descricao?: string;
  referencia?: string;
};

export interface ClienteHttpAsaas {
  testarConexao(): Promise<{ nome: string }>;
  buscarClientePorDocumento(cpfCnpj: string): Promise<ClienteAsaas | null>;
  criarCliente(dados: NovoClienteAsaas): Promise<ClienteAsaas>;
  criarCobranca(dados: NovaCobrancaAsaas): Promise<CobrancaAsaas>;
  cancelarCobranca(id: string): Promise<void>;
  obterLinhaDigitavel(id: string): Promise<string | null>;
  obterPix(id: string): Promise<string | null>;
}

export class ErroAsaas extends Error {
  status: number;

  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroAsaas";
    this.status = status;
  }
}

export function idAsaasSeguro(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new ErroAsaas("Identificador recusado pelo Asaas.", 400);
  }
  return id;
}
