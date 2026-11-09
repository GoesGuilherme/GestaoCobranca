import type { EncargosCobranca, PagadorCobranca } from "@/server/pagamentos/tipos";

export type TokensCora = {
  accessToken: string;
  refreshToken: string | null;
  expiraEm: number;
};

export type NovaFaturaCora = {
  idempotencyKey: string;
  codigo: string;
  valor: string;
  vencimento: string;
  descricao?: string;
  pagador: PagadorCobranca;
  encargos?: EncargosCobranca;
};

export type FaturaCora = {
  id: string;
  status: string;
  valor: string;
  valorPago: string;
  vencimento: string;
  pagoEm: string | null;
  codigo: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  boletoUrl: string | null;
  pixCopiaCola: string | null;
  descricao: string | null;
  metodo: "BANK_SLIP" | "PIX" | null;
};

export type PedidoCora = {
  url: string;
  method: "GET" | "POST" | "DELETE";
  headers: Record<string, string>;
  body?: string;
};

export type RespostaCoraHttp = {
  status: number;
  body: string;
};

export type TransporteCora = (pedido: PedidoCora) => Promise<RespostaCoraHttp>;

export interface ClienteHttpCora {
  testarConexao(): Promise<{ titular: string }>;
  criarFatura(dados: NovaFaturaCora): Promise<FaturaCora>;
  consultarFatura(id: string): Promise<FaturaCora>;
  cancelarFatura(id: string): Promise<void>;
}

export const GATILHOS_WEBHOOK_CORA = ["paid", "canceled", "overdue", "created"] as const;
