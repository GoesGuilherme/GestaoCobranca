import type { ServicoDTO } from "@/lib/tipos";
import { esquemaServico, type EntradaServico } from "@/lib/validacao";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { exigirFinanceiro, type AutorEmpresa } from "@/server/auth/papeis";
import { lerEsquema } from "@/server/validar";
import { paraServico } from "./mapeadores";

function dadosPersistidos(entrada: EntradaServico) {
  return {
    nome: entrada.nome,
    descricao: entrada.descricao?.trim() ? entrada.descricao.trim() : null,
    precoPadrao: entrada.precoPadrao,
    ativo: entrada.ativo,
  };
}

async function garantirNomeLivre(empresaId: string, nome: string, ignorarId?: string) {
  const existente = await prisma.servico.findFirst({
    where: {
      empresaId,
      nome: { equals: nome, mode: "insensitive" },
      ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
    },
    select: { id: true },
  });
  if (existente) {
    throw new ErroAplicacao("Já existe um serviço com este nome nesta empresa.", 409, "nome_duplicado", {
      nome: "Já existe um serviço com este nome nesta empresa.",
    });
  }
}

function conflitoDeNome(erro: unknown): ErroAplicacao | null {
  if (typeof erro === "object" && erro && "code" in erro && erro.code === "P2002") {
    return new ErroAplicacao("Já existe um serviço com este nome nesta empresa.", 409, "nome_duplicado", {
      nome: "Já existe um serviço com este nome nesta empresa.",
    });
  }
  return null;
}

async function buscar(empresaId: string, id: string) {
  const servico = await prisma.servico.findFirst({
    where: { id, empresaId },
    include: { _count: { select: { vinculos: true } } },
  });
  if (!servico) {
    throw new ErroAplicacao("Serviço não encontrado.", 404, "nao_encontrado");
  }
  return servico;
}

export async function listarServicos(empresaId: string): Promise<ServicoDTO[]> {
  const servicos = await prisma.servico.findMany({
    where: { empresaId },
    include: { _count: { select: { vinculos: true } } },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return servicos.map(paraServico);
}

export async function obterServico(empresaId: string, id: string): Promise<ServicoDTO> {
  return paraServico(await buscar(empresaId, id));
}

export async function criarServico(autor: AutorEmpresa, entrada: unknown): Promise<ServicoDTO> {
  exigirFinanceiro(autor);
  const dados = dadosPersistidos(lerEsquema(esquemaServico, entrada));
  await garantirNomeLivre(autor.empresaId, dados.nome);

  try {
    const servico = await prisma.servico.create({
      data: { ...dados, empresaId: autor.empresaId },
      include: { _count: { select: { vinculos: true } } },
    });
    return paraServico(servico);
  } catch (erro) {
    const conflito = conflitoDeNome(erro);
    if (conflito) throw conflito;
    throw erro;
  }
}

export async function atualizarServico(
  autor: AutorEmpresa,
  id: string,
  entrada: unknown,
): Promise<ServicoDTO> {
  exigirFinanceiro(autor);
  await buscar(autor.empresaId, id);
  const dados = dadosPersistidos(lerEsquema(esquemaServico, entrada));
  await garantirNomeLivre(autor.empresaId, dados.nome, id);

  try {
    const alterado = await prisma.servico.updateMany({
      where: { id, empresaId: autor.empresaId },
      data: dados,
    });
    if (alterado.count !== 1) {
      throw new ErroAplicacao("Serviço não encontrado.", 404, "nao_encontrado");
    }
  } catch (erro) {
    const conflito = conflitoDeNome(erro);
    if (conflito) throw conflito;
    throw erro;
  }

  return obterServico(autor.empresaId, id);
}

export async function excluirServico(autor: AutorEmpresa, id: string): Promise<void> {
  exigirFinanceiro(autor);
  const servico = await buscar(autor.empresaId, id);
  if (servico._count.vinculos > 0) {
    throw new ErroAplicacao(
      "Este serviço está vinculado a clientes. Inative-o no catálogo ou remova os vínculos antes de excluir.",
      409,
      "servico_em_uso",
    );
  }
  const apagado = await prisma.servico.deleteMany({ where: { id, empresaId: autor.empresaId } });
  if (apagado.count !== 1) {
    throw new ErroAplicacao("Serviço não encontrado.", 404, "nao_encontrado");
  }
}
