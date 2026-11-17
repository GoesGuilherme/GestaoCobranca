import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import {
  escolherRota,
  idFormaPadrao,
  listarOpcoesCobranca,
  opcaoPorId,
  type DisponibilidadeCobranca,
  type PainelFormasCobranca,
  type RotaCobranca,
} from "@/lib/formas-cobranca";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { obterPreferenciasCobranca } from "./preferencia-cobranca-service";

export async function disponibilidadeDaEmpresa(empresaId: string): Promise<DisponibilidadeCobranca> {
  const [pix, asaas, pagamentos] = await Promise.all([
    prisma.configuracaoPixProprio.findUnique({ where: { empresaId }, select: { ativo: true } }),
    prisma.configuracaoAsaas.findUnique({ where: { empresaId }, select: { id: true } }),
    prisma.configuracaoPagamento.findMany({
      where: { empresaId, ativo: true, provedor: { in: ["CORA", "INTER"] } },
      select: { provedor: true },
    }),
  ]);
  return {
    pixDireto: Boolean(pix?.ativo),
    asaas: Boolean(asaas),
    cora: pagamentos.some((item) => item.provedor === "CORA"),
    inter: pagamentos.some((item) => item.provedor === "INTER"),
  };
}

export async function painelFormasCobranca(empresaId: string): Promise<PainelFormasCobranca> {
  const [empresa, prefs, disponibilidade] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { provedorPagamento: true } }),
    obterPreferenciasCobranca(empresaId),
    disponibilidadeDaEmpresa(empresaId),
  ]);
  const opcoes = listarOpcoesCobranca(disponibilidade);
  const padraoId = idFormaPadrao(empresa?.provedorPagamento, prefs.formaCobranca);
  return { opcoes, padraoId, padraoDisponivel: opcoes.some((item) => item.id === padraoId) };
}

export async function resolverRotaCobranca(
  empresaId: string,
  provedorInformado?: string | null,
  formaInformada?: string | null,
): Promise<RotaCobranca> {
  const [empresa, prefs, disponibilidade] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { provedorPagamento: true } }),
    obterPreferenciasCobranca(empresaId),
    disponibilidadeDaEmpresa(empresaId),
  ]);
  if (!empresa) throw new ErroAplicacao("Empresa não encontrada.", 404, "nao_encontrado");
  const rota = escolherRota({
    provedorInformado,
    formaInformada,
    provedorEmpresa: empresa.provedorPagamento,
    formaPadrao: prefs.formaCobranca,
    opcoes: listarOpcoesCobranca(disponibilidade),
  });
  if (!rota) {
    throw new ErroAplicacao("Esta forma de cobrança não está disponível para a empresa.", 422, "forma_indisponivel");
  }
  return rota;
}

export async function definirFormaPadrao(autor: AutorEmpresa, opcaoId: string): Promise<PainelFormasCobranca> {
  exigirCobranca(autor);
  const disponibilidade = await disponibilidadeDaEmpresa(autor.empresaId);
  const opcoes = listarOpcoesCobranca(disponibilidade);
  const opcao = opcaoPorId(opcaoId, opcoes);
  if (!opcao) {
    throw new ErroAplicacao("Esta forma de cobrança não está disponível para a empresa.", 422, "forma_indisponivel");
  }
  const prefs = PREFERENCIAS_COBRANCA_PADRAO;
  await prisma.$transaction([
    prisma.empresa.update({
      where: { id: autor.empresaId },
      data: { provedorPagamento: opcao.provedor },
    }),
    prisma.preferenciaCobranca.upsert({
      where: { empresaId: autor.empresaId },
      create: {
        empresaId: autor.empresaId,
        formaCobranca: opcao.forma,
        diaVencimento: prefs.diaVencimento,
        modeloDescricao: prefs.modeloDescricao,
        modeloMensagem: prefs.modeloMensagem,
        modeloAssunto: prefs.modeloAssunto,
      },
      update: { formaCobranca: opcao.forma },
    }),
  ]);
  return painelFormasCobranca(autor.empresaId);
}
