export type Segmento = "RESTAURANTE" | "MERCADO_AUTONOMO" | "OUTRO";
export type StatusCliente = "ATIVO" | "INATIVO" | "EM_IMPLANTACAO";
export type StatusFilial = "ATIVA" | "INATIVA" | "EM_IMPLANTACAO";
export type TipoDocumento = "CPF" | "CNPJ";
export type StatusEmpresa = "ATIVA" | "SUSPENSA";
export type PapelUsuario = "DONO" | "FINANCEIRO" | "SUPORTE";
export type RecorrenciaServico = "MENSAL" | "AVULSO";
export type StatusServicoCliente = "ATIVO" | "INATIVO";

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
  valorMensalAtivo: string;
  criadoEm: string;
  atualizadoEm: string;
};

export type ServicoDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  precoPadrao: string;
  ativo: boolean;
  quantidadeVinculos: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type ClienteServicoDTO = {
  id: string;
  clienteId: string;
  servicoId: string;
  nomeServico: string;
  valor: string;
  recorrencia: RecorrenciaServico;
  inicioEm: string;
  status: StatusServicoCliente;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type ClienteDetalhe = ClienteResumo & {
  filiais: FilialDTO[];
};

export type EmpresaResumo = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  emailContato: string;
  telefone: string;
  status: StatusEmpresa;
  plano: string;
  quantidadeUsuarios: number;
  quantidadeClientes: number;
  criadoEm: string;
};

export type UsuarioResumo = {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  superadministrador: boolean;
  criadoEm: string;
};

export type Painel = {
  totalClientes: number;
  totalFiliais: number;
  porStatus: Record<StatusCliente, number>;
  porSegmento: Record<Segmento, number>;
  recentes: ClienteResumo[];
  receitaMensal: string;
};
