import { somenteDocumento } from "@/lib/documento";
import type { FilialDTO } from "@/lib/tipos";
import { esquemaFilial, type EntradaFilial } from "@/lib/validacao";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { paraFilial } from "./mapeadores";

function dadosPersistidos(entrada: EntradaFilial) {
  return {
    nome: entrada.nome,
    cnpj: somenteDocumento(entrada.cnpj),
    endereco: entrada.endereco,
    cidade: entrada.cidade,
    uf: entrada.uf.toUpperCase(),
    status: entrada.status,
    observacoes: entrada.observacoes?.trim() ? entrada.observacoes.trim() : null,
  };
}

async function garantirCliente(empresaId: string, clienteId: string) {
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!cliente) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }
}

async function buscarFilial(empresaId: string, id: string) {
  const filial = await prisma.filial.findFirst({
    where: { id, cliente: { empresaId } },
  });
  if (!filial) {
    throw new ErroAplicacao("Filial não encontrada.", 404, "nao_encontrado");
  }
  return filial;
}

export async function listarFiliais(empresaId: string, clienteId: string): Promise<FilialDTO[]> {
  await garantirCliente(empresaId, clienteId);
  const filiais = await prisma.filial.findMany({
    where: { clienteId, cliente: { empresaId } },
    orderBy: { nome: "asc" },
  });
  return filiais.map(paraFilial);
}

export async function obterFilial(empresaId: string, id: string): Promise<FilialDTO> {
  return paraFilial(await buscarFilial(empresaId, id));
}

export async function criarFilial(
  empresaId: string,
  clienteId: string,
  entrada: unknown,
): Promise<FilialDTO> {
  await garantirCliente(empresaId, clienteId);
  const dados = dadosPersistidos(lerEsquema(esquemaFilial, entrada));
  const filial = await prisma.filial.create({
    data: { ...dados, clienteId },
  });
  return paraFilial(filial);
}

export async function atualizarFilial(
  empresaId: string,
  id: string,
  entrada: unknown,
): Promise<FilialDTO> {
  const existente = await buscarFilial(empresaId, id);
  const dados = dadosPersistidos(lerEsquema(esquemaFilial, entrada));
  const alterada = await prisma.filial.updateMany({
    where: { id: existente.id, cliente: { empresaId } },
    data: dados,
  });
  if (alterada.count !== 1) {
    throw new ErroAplicacao("Filial não encontrada.", 404, "nao_encontrado");
  }
  return obterFilial(empresaId, id);
}

export async function excluirFilial(empresaId: string, id: string): Promise<void> {
  await buscarFilial(empresaId, id);
  const apagada = await prisma.filial.deleteMany({
    where: { id, cliente: { empresaId } },
  });
  if (apagada.count !== 1) {
    throw new ErroAplicacao("Filial não encontrada.", 404, "nao_encontrado");
  }
}
