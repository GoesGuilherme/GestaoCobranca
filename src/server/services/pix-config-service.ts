import { normalizarChavePix, type RascunhoPix } from "@/lib/pix-chave";
import { esquemaConfiguracaoPix } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

export type ConfiguracaoPixDTO = RascunhoPix & {
  configurado: boolean;
  provedorAtual: string;
};

const VAZIO: RascunhoPix = {
  tipoChave: "CNPJ",
  chavePix: "",
  nomeRecebedor: "",
  cidadeRecebedor: "",
  usarNasCobrancas: false,
};

export async function obterConfiguracaoPix(autor: AutorEmpresa): Promise<ConfiguracaoPixDTO> {
  exigirCobranca(autor);
  const [config, empresa] = await Promise.all([
    prisma.configuracaoPixProprio.findUnique({ where: { empresaId: autor.empresaId } }),
    prisma.empresa.findUnique({ where: { id: autor.empresaId }, select: { provedorPagamento: true } }),
  ]);
  if (!empresa) throw new ErroAplicacao("Empresa não encontrada.", 404, "nao_encontrado");
  if (!config) {
    return { ...VAZIO, configurado: false, provedorAtual: empresa.provedorPagamento, usarNasCobrancas: false };
  }
  return {
    configurado: true,
    tipoChave: config.tipoChave,
    chavePix: config.chavePix,
    nomeRecebedor: config.nomeRecebedor,
    cidadeRecebedor: config.cidadeRecebedor,
    usarNasCobrancas: empresa.provedorPagamento === "PIX_DIRETO",
    provedorAtual: empresa.provedorPagamento,
  };
}

export async function salvarConfiguracaoPix(autor: AutorEmpresa, entrada: unknown): Promise<ConfiguracaoPixDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaConfiguracaoPix, entrada);
  const chave = normalizarChavePix(dados.tipoChave, dados.chavePix);
  if (!chave.ok) throw new ErroAplicacao(chave.erro, 400, "chave_invalida");

  const empresa = await prisma.empresa.findUnique({
    where: { id: autor.empresaId },
    select: { provedorPagamento: true },
  });
  if (!empresa) throw new ErroAplicacao("Empresa não encontrada.", 404, "nao_encontrado");

  await prisma.configuracaoPixProprio.upsert({
    where: { empresaId: autor.empresaId },
    create: {
      empresaId: autor.empresaId,
      tipoChave: chave.tipo,
      chavePix: chave.chave,
      nomeRecebedor: dados.nomeRecebedor.trim(),
      cidadeRecebedor: dados.cidadeRecebedor.trim(),
      ativo: true,
    },
    update: {
      tipoChave: chave.tipo,
      chavePix: chave.chave,
      nomeRecebedor: dados.nomeRecebedor.trim(),
      cidadeRecebedor: dados.cidadeRecebedor.trim(),
      ativo: true,
    },
  });

  if (dados.usarNasCobrancas) {
    await prisma.empresa.update({ where: { id: autor.empresaId }, data: { provedorPagamento: "PIX_DIRETO" } });
  } else if (empresa.provedorPagamento === "PIX_DIRETO") {
    await prisma.empresa.update({ where: { id: autor.empresaId }, data: { provedorPagamento: "ASAAS" } });
  }

  return obterConfiguracaoPix(autor);
}
