import type { ClienteServicoDTO } from "@/lib/tipos";
import { esquemaClienteServico, type EntradaClienteServico } from "@/lib/validacao";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { exigirFinanceiro, type AutorEmpresa } from "@/server/auth/papeis";
import { lerEsquema } from "@/server/validar";
import { paraClienteServico } from "./mapeadores";

const incluirServico = {
  servico: { select: { nome: true, aliquotaImposto: true } },
} as const;

function dadosPersistidos(entrada: EntradaClienteServico) {
  return {
    servicoId: entrada.servicoId,
    valor: entrada.valor,
    custo: entrada.custo,
    recorrencia: entrada.recorrencia,
    inicioEm: new Date(`${entrada.inicioEm}T00:00:00.000Z`),
    status: entrada.status,
    observacoes: entrada.observacoes?.trim() ? entrada.observacoes.trim() : null,
  };
}

async function garantirCliente(empresaId: string, clienteId: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { id: true },
  });
  if (!cliente) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }
}

async function buscarServico(empresaId: string, servicoId: string) {
  const servico = await prisma.servico.findFirst({ where: { id: servicoId, empresaId } });
  if (!servico) {
    throw new ErroAplicacao("Serviço não encontrado.", 404, "nao_encontrado");
  }
  return servico;
}

async function buscarVinculo(empresaId: string, id: string) {
  const vinculo = await prisma.clienteServico.findFirst({
    where: { id, empresaId },
    include: incluirServico,
  });
  if (!vinculo) {
    throw new ErroAplicacao("Serviço do cliente não encontrado.", 404, "nao_encontrado");
  }
  return vinculo;
}

export async function listarServicosDoCliente(
  empresaId: string,
  clienteId: string,
  incluirCusto = false,
  incluirCobranca = false,
): Promise<ClienteServicoDTO[]> {
  await garantirCliente(empresaId, clienteId);
  const vinculos = await prisma.clienteServico.findMany({
    where: { clienteId, empresaId },
    include: incluirServico,
    orderBy: [{ status: "asc" }, { servico: { nome: "asc" } }],
  });
  return vinculos.map((vinculo) => paraClienteServico(vinculo, incluirCusto, incluirCobranca));
}

export async function criarServicoDoCliente(
  autor: AutorEmpresa,
  clienteId: string,
  entrada: unknown,
): Promise<ClienteServicoDTO> {
  exigirFinanceiro(autor);
  await garantirCliente(autor.empresaId, clienteId);
  const dados = dadosPersistidos(lerEsquema(esquemaClienteServico, entrada));
  const servico = await buscarServico(autor.empresaId, dados.servicoId);
  if (!servico.ativo) {
    throw new ErroAplicacao(
      "Este serviço está inativo no catálogo. Reative-o antes de vender de novo.",
      409,
      "servico_inativo",
    );
  }

  const vinculo = await prisma.clienteServico.create({
    data: {
      ...dados,
      empresaId: autor.empresaId,
      clienteId,
    },
    include: incluirServico,
  });
  return paraClienteServico(vinculo, true);
}

export async function atualizarServicoDoCliente(
  autor: AutorEmpresa,
  id: string,
  entrada: unknown,
): Promise<ClienteServicoDTO> {
  exigirFinanceiro(autor);
  const existente = await buscarVinculo(autor.empresaId, id);
  const dados = dadosPersistidos(lerEsquema(esquemaClienteServico, entrada));
  const servico = await buscarServico(autor.empresaId, dados.servicoId);
  if (!servico.ativo && servico.id !== existente.servicoId) {
    throw new ErroAplicacao(
      "Este serviço está inativo no catálogo. Reative-o antes de vender de novo.",
      409,
      "servico_inativo",
    );
  }

  const alterado = await prisma.clienteServico.updateMany({
    where: { id: existente.id, empresaId: autor.empresaId },
    data: dados,
  });
  if (alterado.count !== 1) {
    throw new ErroAplicacao("Serviço do cliente não encontrado.", 404, "nao_encontrado");
  }
  return paraClienteServico(await buscarVinculo(autor.empresaId, id), true);
}

export async function excluirServicoDoCliente(autor: AutorEmpresa, id: string): Promise<void> {
  exigirFinanceiro(autor);
  await buscarVinculo(autor.empresaId, id);
  const apagado = await prisma.clienteServico.deleteMany({
    where: { id, empresaId: autor.empresaId },
  });
  if (apagado.count !== 1) {
    throw new ErroAplicacao("Serviço do cliente não encontrado.", 404, "nao_encontrado");
  }
}
