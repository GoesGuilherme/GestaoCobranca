import { Prisma } from "@/generated/prisma/client";
import { identificarDocumento, somenteDigitos, somenteDocumento } from "@/lib/documento";
import type { ClienteDetalhe, ClienteResumo, PapelUsuario, Segmento, StatusCliente } from "@/lib/tipos";
import { esquemaCliente, type EntradaCliente } from "@/lib/validacao";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { paraCliente, paraClienteDetalhe } from "./mapeadores";

const SEGMENTOS = new Set<Segmento>(["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"]);
const STATUS = new Set<StatusCliente>(["ATIVO", "INATIVO", "EM_IMPLANTACAO", "BLOQUEADO"]);

export type FiltroClientes = {
  q?: string;
  segmento?: string;
  status?: string;
};

function comoSegmento(valor?: string): Segmento | undefined {
  if (valor && SEGMENTOS.has(valor as Segmento)) return valor as Segmento;
  return undefined;
}

function comoStatus(valor?: string): StatusCliente | undefined {
  if (valor && STATUS.has(valor as StatusCliente)) return valor as StatusCliente;
  return undefined;
}

function dadosPersistidos(entrada: EntradaCliente) {
  const documento = identificarDocumento(entrada.documento);
  if (!documento) {
    throw new ErroAplicacao("Informe um CPF ou CNPJ válido.", 400, "documento_invalido", {
      documento: "Informe um CPF ou CNPJ válido.",
    });
  }

  return {
    nomeFantasia: entrada.nomeFantasia,
    razaoSocial: entrada.razaoSocial,
    documento: documento.normalizado,
    tipoDocumento: documento.tipo,
    segmento: entrada.segmento,
    contatoNome: entrada.contatoNome,
    whatsapp: somenteDigitos(entrada.whatsapp),
    email: entrada.email.toLowerCase(),
    cidade: entrada.cidade,
    uf: entrada.uf.toUpperCase(),
    status: entrada.status,
    observacoes: entrada.observacoes?.trim() ? entrada.observacoes.trim() : null,
  };
}

async function garantirDocumentoLivre(empresaId: string, documento: string, ignorarId?: string) {
  const existente = await prisma.cliente.findFirst({ where: { empresaId, documento } });
  if (existente && existente.id !== ignorarId) {
    throw new ErroAplicacao(
      "Já existe um cliente com este CPF/CNPJ nesta empresa.",
      409,
      "documento_duplicado",
      { documento: "Já existe um cliente com este CPF/CNPJ nesta empresa." },
    );
  }
}

function incluirResumo() {
  return {
    _count: { select: { filiais: true } },
    servicos: {
      where: { status: "ATIVO" as const, recorrencia: "MENSAL" as const },
      select: { valor: true },
    },
  };
}

export async function listarClientes(
  empresaId: string,
  filtro: FiltroClientes = {},
): Promise<ClienteResumo[]> {
  const termo = filtro.q?.trim();
  const documento = termo ? somenteDocumento(termo) : "";
  const segmento = comoSegmento(filtro.segmento);
  const status = comoStatus(filtro.status);

  const onde: Prisma.ClienteWhereInput = {
    empresaId,
    ...(segmento ? { segmento } : {}),
    ...(status ? { status } : {}),
  };

  if (termo) {
    const ou: Prisma.ClienteWhereInput[] = [
      { nomeFantasia: { contains: termo, mode: "insensitive" } },
      { razaoSocial: { contains: termo, mode: "insensitive" } },
      { cidade: { contains: termo, mode: "insensitive" } },
    ];
    if (documento.length >= 3) {
      ou.push({ documento: { contains: documento, mode: "insensitive" } });
    }
    onde.OR = ou;
  }

  const clientes = await prisma.cliente.findMany({
    where: onde,
    include: incluirResumo(),
    orderBy: { nomeFantasia: "asc" },
  });

  return clientes.map(paraCliente);
}

export async function obterCliente(empresaId: string, id: string): Promise<ClienteDetalhe> {
  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId },
    include: {
      ...incluirResumo(),
      filiais: { orderBy: { nome: "asc" } },
      regua: { select: { nome: true } },
    },
  });
  if (!cliente) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }
  return comReguaVisivel(empresaId, paraClienteDetalhe(cliente));
}

export async function criarCliente(
  empresaId: string,
  entrada: unknown,
  papel?: PapelUsuario,
): Promise<ClienteDetalhe> {
  const dados = dadosPersistidos(lerEsquema(esquemaCliente, entrada));
  exigirDonoParaBloqueio(null, dados.status, papel);
  await garantirDocumentoLivre(empresaId, dados.documento);

  try {
    const cliente = await prisma.cliente.create({
      data: { ...dados, empresaId },
      include: {
        ...incluirResumo(),
        filiais: true,
        regua: { select: { nome: true } },
      },
    });
    return comReguaVisivel(empresaId, paraClienteDetalhe(cliente));
  } catch (erro) {
    if (codigoPrisma(erro) === "P2002") {
      throw new ErroAplicacao(
        "Já existe um cliente com este CPF/CNPJ nesta empresa.",
        409,
        "documento_duplicado",
        { documento: "Já existe um cliente com este CPF/CNPJ nesta empresa." },
      );
    }
    throw erro;
  }
}

export async function atualizarCliente(
  empresaId: string,
  id: string,
  entrada: unknown,
  papel?: PapelUsuario,
): Promise<ClienteDetalhe> {
  const atual = await obterCliente(empresaId, id);
  const dados = dadosPersistidos(lerEsquema(esquemaCliente, entrada));
  exigirDonoParaBloqueio(atual.status, dados.status, papel);
  await garantirDocumentoLivre(empresaId, dados.documento, id);

  const alterado = await prisma.cliente.updateMany({
    where: { id, empresaId },
    data: dados,
  });
  if (alterado.count !== 1) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }

  const cliente = await prisma.cliente.findFirstOrThrow({
    where: { id, empresaId },
    include: {
      ...incluirResumo(),
      filiais: { orderBy: { nome: "asc" } },
      regua: { select: { nome: true } },
    },
  });
  return comReguaVisivel(empresaId, paraClienteDetalhe(cliente));
}

async function comReguaVisivel(empresaId: string, detalhe: ClienteDetalhe): Promise<ClienteDetalhe> {
  if (detalhe.reguaModo !== "PADRAO") return detalhe;
  const padrao = await prisma.reguaCobranca.findFirst({
    where: { empresaId, padrao: true },
    select: { nome: true },
  });
  return { ...detalhe, reguaNome: padrao?.nome ?? null };
}

export async function excluirCliente(empresaId: string, id: string): Promise<void> {
  await obterCliente(empresaId, id);
  const apagado = await prisma.cliente.deleteMany({ where: { id, empresaId } });
  if (apagado.count !== 1) {
    throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  }
}

function exigirDonoParaBloqueio(atual: StatusCliente | null, proximo: StatusCliente, papel?: PapelUsuario) {
  if (!papel || papel === "DONO") return;
  if ((proximo === "BLOQUEADO" || atual === "BLOQUEADO") && atual !== proximo) {
    throw new ErroAplicacao("Só o dono marca ou tira o status Bloqueado.", 403, "proibido");
  }
}

function codigoPrisma(erro: unknown): string | undefined {
  if (typeof erro === "object" && erro && "code" in erro && typeof erro.code === "string") {
    return erro.code;
  }
  return undefined;
}
