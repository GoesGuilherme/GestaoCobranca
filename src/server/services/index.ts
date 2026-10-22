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
