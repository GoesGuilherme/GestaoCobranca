export type Segmento = "RESTAURANTE" | "MERCADO_AUTONOMO" | "OUTRO";
export type StatusCliente = "ATIVO" | "INATIVO" | "EM_IMPLANTACAO" | "BLOQUEADO";
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
  whatsapp: string | null;
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
  ativadoEm: string | null;
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

export type SituacaoCartao = "AGUARDANDO" | "CADASTRADO" | "RECUSADO";

export type RecorrenciaAsaasDTO = {
  status: string;
  formaCobranca: string | null;
  diaVencimento: number | null;
  proximoVencimento: string | null;
  descricao: string | null;
  urlCobranca: string | null;
  cartaoStatus: SituacaoCartao | null;
  cartaoBandeira: string | null;
  cartaoFinal: string | null;
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

export type PreferenciasCobrancaDTO = {
  formaCobranca: "BOLETO" | "PIX" | "UNDEFINED" | "CREDIT_CARD";
  diaVencimento: number;
  modeloDescricao: string;
  multaPercentual: string | null;
  jurosPercentual: string | null;
  descontoPercentual: string | null;
  descontoDiasAntes: number | null;
  diasAntesGerar: 7 | 14 | 40 | null;
  atualizarPendentes: boolean;
  modeloMensagem: string;
  modeloAssunto: string;
};

export type ModoReguaCliente = "PADRAO" | "ESPECIFICA" | "NENHUMA";
export type StatusLembrete = "ENVIADO" | "FALHOU" | "IGNORADO" | "NA_FILA";

export type ClienteDetalhe = ClienteResumo & {
  filiais: FilialDTO[];
  reguaModo: ModoReguaCliente;
  reguaId: string | null;
  reguaPausada: boolean;
  reguaNome: string | null;
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
export type FormaCobranca = "BOLETO" | "PIX" | "UNDEFINED" | "CREDIT_CARD";
export type SituacaoFatura = "em_aberto" | "vencidas" | "pagas" | "canceladas" | "todas";
export type FiltroVisualizacao = "todas" | "vistas" | "nao_vistas";

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
  visualizada: boolean;
  atualizadoEm: string;
  whatsapp: string;
  email: string;
  reguaModo: ModoReguaCliente;
  reguaId: string | null;
  lembretes: LembreteReguaDTO[];
};

export type ConfiguracaoReguaDTO = {
  gravada: boolean;
  ativa: boolean;
  modoTeste: boolean;
  remetenteNome: string;
  remetenteEmail: string;
  replyTo: string;
  configurada: boolean;
};

export type PassoReguaDTO = {
  id: string;
  ordem: number;
  naEmissao: boolean;
  dias: number | null;
  canal: "EMAIL";
  assunto: string;
  corpo: string;
  rotulo: string;
  enviarWhatsapp: boolean;
};

export type CoexistenciaTwilioDTO = "NAO_SOLICITADA" | "SOLICITADA" | "ATIVA" | "INDISPONIVEL";

export type TemplateWhatsappDTO = {
  tipo: "BOLETO_GERADO" | "VENCE_EM_DIAS" | "VENCEU" | "PAGO";
  nome: string;
  status: string;
  motivo: string | null;
};

export type ConfiguracaoTwilioDTO = {
  conectada: boolean;
  subaccountSid: string | null;
  senderTelefone: string | null;
  senderStatus: string | null;
  coexistencia: CoexistenciaTwilioDTO;
  nomeExibicao: string;
  wabaId: string | null;
  erro: string | null;
  tokenMascarado: string | null;
  templates: TemplateWhatsappDTO[];
};

export type ReguaDTO = {
  id: string;
  nome: string;
  padrao: boolean;
  horaInicio: number;
  horaFim: number;
  enviarFimDeSemana: boolean;
  passos: PassoReguaDTO[];
};

export type LembreteReguaDTO = {
  id: string;
  passoId: string | null;
  canal: string;
  status: StatusLembrete;
  motivo: string | null;
  destino: string | null;
  automatico: boolean;
  modoTeste: boolean;
  rotulo: string;
  criadoEm: string;
};

export type AtribuicaoReguaDTO = {
  modo: ModoReguaCliente;
  reguaId: string | null;
  pausada: boolean;
  nome: string | null;
};

export type ConfiguracaoAsaasDTO = {
  configurado: boolean;
  ambiente: AmbienteAsaas | null;
  chaveMascarada: string | null;
  tokenWebhook: string | null;
  simulado: boolean;
  aviso: string | null;
};

export type ConfiguracaoAssessorDTO = {
  gravada: boolean;
  ativo: boolean;
  modoTeste: boolean;
  nome: string;
  tom: string;
  promptExtra: string;
  horaInicio: number;
  horaFim: number;
  atendeFimDeSemana: boolean;
};

export type ConversaAssessorDTO = {
  id: string;
  telefone: string;
  nomeCliente: string | null;
  iaPausada: boolean;
  aguardandoDocumento: boolean;
  janelaAberta: boolean;
  janelaAte: string;
  atualizadoEm: string;
  pedidosAbertos: number;
};

export type ConversaAssessorDetalhe = ConversaAssessorDTO & {
  mensagens: { id: string; papel: "CLIENTE" | "ASSESSOR" | "HUMANO" | "SISTEMA"; corpo: string; criadoEm: string }[];
  pedidos: { id: string; motivo: string; resumo: string; status: string; criadoEm: string }[];
};

export type Painel = {
  totalClientes: number;
  totalFiliais: number;
  porStatus: Record<StatusCliente, number>;
  porSegmento: Record<Segmento, number>;
  recentes: ClienteResumo[];
  receitaMensal: string;
};
