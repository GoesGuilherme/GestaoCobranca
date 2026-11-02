import type { SegmentoDTO } from "@/lib/tipos";
import { SUGESTOES_SEGMENTO } from "@/lib/segmentos";
import { esquemaSegmento, type EntradaSegmento } from "@/lib/validacao";
import { exigirSegmentos, type AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { paraSegmento } from "./mapeadores";

function dadosPersistidos(entrada: EntradaSegmento) {
  const cor = entrada.cor?.trim();
  return {
    nome: entrada.nome,
    descricao: entrada.descricao?.trim() ? entrada.descricao.trim() : null,
    cor: cor ? cor.toLowerCase() : null,
    ativo: entrada.ativo,
  };
}

async function garantirNomeLivre(empresaId: string, nome: string, ignorarId?: string) {
  const existente = await prisma.segmentoCliente.findFirst({
    where: {
      empresaId,
      nome: { equals: nome, mode: "insensitive" },
      ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
    },
    select: { id: true },
  });
  if (existente) {
    throw new ErroAplicacao("Já existe um segmento com este nome nesta empresa.", 409, "nome_duplicado", {
      nome: "Já existe um segmento com este nome nesta empresa.",
    });
  }
}

function conflitoDeNome(erro: unknown): ErroAplicacao | null {
  if (typeof erro === "object" && erro && "code" in erro && erro.code === "P2002") {
    return new ErroAplicacao("Já existe um segmento com este nome nesta empresa.", 409, "nome_duplicado", {
      nome: "Já existe um segmento com este nome nesta empresa.",
    });
  }
  return null;
}

function incluirContagem() {
  return { _count: { select: { clientes: true } } };
}

async function buscar(empresaId: string, id: string) {
  const segmento = await prisma.segmentoCliente.findFirst({
    where: { id, empresaId },
    include: incluirContagem(),
  });
  if (!segmento) {
    throw new ErroAplicacao("Segmento não encontrado.", 404, "nao_encontrado");
  }
  return segmento;
}

export async function listarSegmentos(empresaId: string): Promise<SegmentoDTO[]> {
  const segmentos = await prisma.segmentoCliente.findMany({
    where: { empresaId },
    include: incluirContagem(),
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return segmentos.map(paraSegmento);
}

export async function obterSegmento(empresaId: string, id: string): Promise<SegmentoDTO> {
  return paraSegmento(await buscar(empresaId, id));
}

export async function criarSegmento(autor: AutorEmpresa, entrada: unknown): Promise<SegmentoDTO> {
  exigirSegmentos(autor);
  const dados = dadosPersistidos(lerEsquema(esquemaSegmento, entrada));
  await garantirNomeLivre(autor.empresaId, dados.nome);

  try {
    const segmento = await prisma.segmentoCliente.create({
      data: { ...dados, empresaId: autor.empresaId },
      include: incluirContagem(),
    });
    return paraSegmento(segmento);
  } catch (erro) {
    const conflito = conflitoDeNome(erro);
    if (conflito) throw conflito;
    throw erro;
  }
}

export async function atualizarSegmento(
  autor: AutorEmpresa,
  id: string,
  entrada: unknown,
): Promise<SegmentoDTO> {
  exigirSegmentos(autor);
  await buscar(autor.empresaId, id);
  const dados = dadosPersistidos(lerEsquema(esquemaSegmento, entrada));
  await garantirNomeLivre(autor.empresaId, dados.nome, id);

  try {
    const alterado = await prisma.segmentoCliente.updateMany({
      where: { id, empresaId: autor.empresaId },
      data: dados,
    });
    if (alterado.count !== 1) {
      throw new ErroAplicacao("Segmento não encontrado.", 404, "nao_encontrado");
    }
  } catch (erro) {
    const conflito = conflitoDeNome(erro);
    if (conflito) throw conflito;
    throw erro;
  }

  return obterSegmento(autor.empresaId, id);
}

export async function excluirSegmento(autor: AutorEmpresa, id: string): Promise<void> {
  exigirSegmentos(autor);
  const segmento = await buscar(autor.empresaId, id);
  if (segmento._count.clientes > 0) {
    throw new ErroAplicacao(
      "Este segmento está em clientes. Desative-o em vez de excluir.",
      409,
      "segmento_em_uso",
    );
  }
  const apagado = await prisma.segmentoCliente.deleteMany({
    where: { id, empresaId: autor.empresaId },
  });
  if (apagado.count !== 1) {
    throw new ErroAplicacao("Segmento não encontrado.", 404, "nao_encontrado");
  }
}

export async function criarSugestoesSegmento(autor: AutorEmpresa): Promise<{ criados: number }> {
  exigirSegmentos(autor);
  const existentes = await prisma.segmentoCliente.findMany({
    where: { empresaId: autor.empresaId },
    select: { nome: true },
  });
  const nomes = new Set(existentes.map((item) => item.nome.toLocaleLowerCase("pt-BR")));
  let criados = 0;
  for (const sugestao of SUGESTOES_SEGMENTO) {
    if (nomes.has(sugestao.nome.toLocaleLowerCase("pt-BR"))) continue;
    await prisma.segmentoCliente.create({
      data: {
        empresaId: autor.empresaId,
        nome: sugestao.nome,
        cor: sugestao.cor,
        ativo: true,
      },
    });
    nomes.add(sugestao.nome.toLocaleLowerCase("pt-BR"));
    criados += 1;
  }
  return { criados };
}
