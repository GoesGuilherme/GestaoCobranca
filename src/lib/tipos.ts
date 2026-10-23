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
  custo: string | null;
  aliquotaImposto: string | null;
  margem: string | null;
  ativo: boolean;
  quantidadeVinculos: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type RecorrenciaAsaasDTO = {
  status: string;
  formaCobranca: string | null;
  diaVencimento: number | null;
  proximoVencimento: string | null;
  descricao: string | null;
};

export type ClienteServicoDTO = {
  id: string;
  clienteId: string;
  servicoId: string;
  nomeServico: string;
  valor: string;
  custo: string | null;
  aliquotaImposto: string | null;
  margem: string | null;
  recorrencia: RecorrenciaServico;
  inicioEm: string;
  status: StatusServicoCliente;
  observacoes: string | null;
  recorrenciaAsaas: RecorrenciaAsaasDTO | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type PreviaRecorrencia = {
  diaVencimento: number;
  vencimento: string;
  itens: {
    id: string;
    clienteId: string;
    nomeCliente: string;
    nomeServico: string;
    valor: string;
  }[];
};

export type ResultadoLoteRecorrencia = {
  vencimento: string;
  criadas: number;
  falhas: { id: string; erro: string }[];
};

export type ResultadoImportacaoFaturas = {
  criadas: number;
  atualizadas: number;
  ignoradas: number;
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

export type LinhaResultado = {
  id: string;
  nome: string;
  faturamento: string;
  custo: string;
  impostos: string;
  margem: string;
  margemPercentual: string | null;
  semCusto: number;
};

export type BlocoResultado = {
  faturamento: string;
  custo: string;
  impostos: string;
  margem: string;
  margemPercentual: string | null;
  quantidade: number;
  semCusto: number;
  porCliente: LinhaResultado[];
  porServico: LinhaResultado[];
  clientesSemCusto: { id: string; nome: string }[];
};

export type Resultado = {
  mensal: BlocoResultado;
  avulso: BlocoResultado;
};

export type AmbienteAsaas = "SANDBOX" | "PRODUCAO";
export type FormaCobranca = "BOLETO" | "PIX" | "UNDEFINED";
export type SituacaoFatura = "em_aberto" | "vencidas" | "pagas" | "canceladas" | "todas";

export type FaturaDTO = {
  id: string;
  clienteId: string;
  nomeCliente: string;
  clienteServicoId: string | null;
  nomeServico: string | null;
  asaasPaymentId: string;
  valor: string;
  vencimento: string;
  status: string;
  formaCobranca: string;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  faturaUrl: string | null;
  descricao: string | null;
  excluida: boolean;
};

export type ConfiguracaoAsaasDTO = {
  configurado: boolean;
  ambiente: AmbienteAsaas | null;
  chaveMascarada: string | null;
  tokenWebhook: string | null;
  simulado: boolean;
  aviso: string | null;
};

export type Painel = {
  totalClientes: number;
  totalFiliais: number;
  porStatus: Record<StatusCliente, number>;
  porSegmento: Record<Segmento, number>;
  recentes: ClienteResumo[];
  receitaMensal: string;
};
