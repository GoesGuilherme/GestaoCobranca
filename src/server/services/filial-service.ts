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

async function garantirCliente(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }
}

export async function listarFiliais(clienteId: string): Promise<FilialDTO[]> {
  await garantirCliente(clienteId);
  const filiais = await prisma.filial.findMany({
    where: { clienteId },
    orderBy: { nome: "asc" },
  });
  return filiais.map(paraFilial);
}

export async function obterFilial(id: string): Promise<FilialDTO> {
  const filial = await prisma.filial.findUnique({ where: { id } });
  if (!filial) {
    throw new ErroAplicacao("Filial não encontrada.", 404, "nao_encontrado");
  }
  return paraFilial(filial);
}

export async function criarFilial(clienteId: string, entrada: unknown): Promise<FilialDTO> {
  await garantirCliente(clienteId);
  const dados = dadosPersistidos(lerEsquema(esquemaFilial, entrada));
  const filial = await prisma.filial.create({
    data: { ...dados, clienteId },
  });
  return paraFilial(filial);
}

export async function atualizarFilial(id: string, entrada: unknown): Promise<FilialDTO> {
  await obterFilial(id);
  const dados = dadosPersistidos(lerEsquema(esquemaFilial, entrada));
  const filial = await prisma.filial.update({
    where: { id },
    data: dados,
  });
  return paraFilial(filial);
}

export async function excluirFilial(id: string): Promise<void> {
  await obterFilial(id);
  await prisma.filial.delete({ where: { id } });
}
