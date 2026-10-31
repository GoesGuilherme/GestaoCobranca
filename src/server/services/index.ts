// Ponto de entrada estável para as próximas versões.
// O servidor MCP (buscar cliente, listar filiais e as ações que vierem)
// deve importar daqui, sem falar com o Prisma direto.

export {
  atualizarCliente,
  criarCliente,
  excluirCliente,
  listarClientes,
  obterCliente,
} from "./cliente-service";
export {
  atualizarFilial,
  criarFilial,
  excluirFilial,
  listarFiliais,
  obterFilial,
} from "./filial-service";
export { obterPainel } from "./painel-service";
export {
  alterarStatusEmpresa,
  atualizarEmpresa,
  cadastrarEmpresaPeloAdmin,
  cadastrarEmpresaPublica,
  listarEmpresas,
  obterEmpresa,
} from "./empresa-service";
export { criarUsuarioDaEmpresa, listarUsuarios } from "./usuario-service";
export {
  atualizarServico,
  criarServico,
  excluirServico,
  listarServicos,
  obterServico,
} from "./servico-service";
export {
  atualizarServicoDoCliente,
  criarServicoDoCliente,
  excluirServicoDoCliente,
  listarServicosDoCliente,
} from "./cliente-servico-service";
export {
  obterConfiguracaoAsaas,
  regenerarTokenWebhookAsaas,
  salvarConfiguracaoAsaas,
  testarConexaoAsaas,
} from "./asaas-config-service";
export { obterPreferenciasCobranca, salvarPreferenciasCobranca } from "./preferencia-cobranca-service";
export { cancelarFatura, emitirFatura, importarFaturas, listarFaturas } from "./fatura-service";
export { sincronizarVisualizacoesDoAutor } from "./visualizacao-fatura-service";
export {
  atribuirReguaCliente,
  atualizarRegua,
  criarRegua,
  enviarEmailTesteRegua,
  enviarLembreteAgora,
  excluirRegua,
  obterPainelRegua,
  salvarConfiguracaoRegua,
} from "./regua-service";
export { executarRegua } from "./regua-job";
export { processarWebhookAsaas } from "./asaas-webhook-service";
export { atualizarTwilio, conectarTwilio, confirmarCodigoTwilio, obterWhatsappDoPainel } from "./twilio-service";
export { processarWebhookTwilio } from "./twilio-webhook-service";
export {
  assumirConversa,
  devolverConversa,
  obterAssessorDoPainel,
  obterConversa,
  processarEntradaAssessor,
  responderConversa,
  salvarAssessor,
} from "./assessor-service";
export { processarFilaWhatsapp } from "./whatsapp-fila";
export {
  ativarRecorrencia,
  ativarRecorrenciaEmLote,
  cancelarRecorrencia,
  editarRecorrencia,
  listarPreviaRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from "./recorrencia-service";
