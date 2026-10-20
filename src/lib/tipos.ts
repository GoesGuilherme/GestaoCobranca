export type Segmento = "RESTAURANTE" | "MERCADO_AUTONOMO" | "OUTRO";
export type StatusCliente = "ATIVO" | "INATIVO" | "EM_IMPLANTACAO";
export type StatusFilial = "ATIVA" | "INATIVA" | "EM_IMPLANTACAO";
export type TipoDocumento = "CPF" | "CNPJ";

export type FilialDTO = {
  id: string;
  clienteId: string;
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  status: StatusFilial;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type ClienteResumo = {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string;
  tipoDocumento: TipoDocumento;
  segmento: Segmento;
  contatoNome: string;
  whatsapp: string;
  email: string;
  cidade: string;
  uf: string;
  status: StatusCliente;
  observacoes: string | null;
  quantidadeFiliais: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type ClienteDetalhe = ClienteResumo & {
  filiais: FilialDTO[];
};

export type Painel = {
  totalClientes: number;
  totalFiliais: number;
  porStatus: Record<StatusCliente, number>;
  porSegmento: Record<Segmento, number>;
  recentes: ClienteResumo[];
};
