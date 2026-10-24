import { formaCobrancaDe, PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import type { PreferenciasCobrancaDTO } from "@/lib/tipos";
import { esquemaPreferenciasCobranca } from "@/lib/validacao";
import type { EncargosAsaas } from "@/server/asaas/contrato";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirAsaas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { lerEsquema } from "@/server/validar";

type LinhaPreferencia = {
  formaCobranca: string;
  diaVencimento: number;
  modeloDescricao: string;
  multaPercentual: { toFixed(casas: number): string } | null;
  jurosPercentual: { toFixed(casas: number): string } | null;
  descontoPercentual: { toFixed(casas: number): string } | null;
  descontoDiasAntes: number | null;
  diasAntesGerar: number | null;
  atualizarPendentes: boolean;
};

function percentual(valor: { toFixed(casas: number): string } | null): string | null {
  return valor ? valor.toFixed(2) : null;
}

function diasAntes(valor: number | null): PreferenciasCobrancaDTO["diasAntesGerar"] {
  if (valor === 7 || valor === 14 || valor === 40) return valor;
  return null;
}

function paraPreferencias(linha: LinhaPreferencia | null): PreferenciasCobrancaDTO {
  if (!linha) return PREFERENCIAS_COBRANCA_PADRAO;
  return {
    formaCobranca: formaCobrancaDe(linha.formaCobranca),
    diaVencimento: linha.diaVencimento,
    modeloDescricao: linha.modeloDescricao,
    multaPercentual: percentual(linha.multaPercentual),
    jurosPercentual: percentual(linha.jurosPercentual),
    descontoPercentual: percentual(linha.descontoPercentual),
    descontoDiasAntes: linha.descontoDiasAntes,
    diasAntesGerar: diasAntes(linha.diasAntesGerar),
    atualizarPendentes: linha.atualizarPendentes,
  };
}

export function encargosDaPreferencia(prefs: PreferenciasCobrancaDTO): EncargosAsaas {
  return {
    multaPercentual: prefs.multaPercentual,
    jurosPercentual: prefs.jurosPercentual,
    descontoPercentual: prefs.descontoPercentual,
    descontoDiasAntes: prefs.descontoPercentual ? (prefs.descontoDiasAntes ?? 0) : null,
  };
}

export function escolherPercentual(informado: string | null | undefined, padrao: string | null): string | null {
  if (informado === undefined) return padrao;
  return informado;
}

export async function obterPreferenciasCobranca(empresaId: string): Promise<PreferenciasCobrancaDTO> {
  const linha = await prisma.preferenciaCobranca.findUnique({ where: { empresaId } });
  return paraPreferencias(linha);
}

export async function salvarPreferenciasCobranca(
  autor: AutorEmpresa,
  entrada: unknown,
): Promise<PreferenciasCobrancaDTO> {
  exigirAsaas(autor);
  const dados = lerEsquema(esquemaPreferenciasCobranca, entrada);
  const desconto = dados.descontoPercentual;
  const campos = {
    formaCobranca: dados.formaCobranca,
    diaVencimento: dados.diaVencimento,
    modeloDescricao: dados.modeloDescricao,
    multaPercentual: dados.multaPercentual,
    jurosPercentual: dados.jurosPercentual,
    descontoPercentual: desconto,
    descontoDiasAntes: desconto === null ? null : (dados.descontoDiasAntes ?? 0),
    diasAntesGerar: dados.diasAntesGerar,
    atualizarPendentes: dados.atualizarPendentes,
  };
  const linha = await prisma.preferenciaCobranca.upsert({
    where: { empresaId: autor.empresaId },
    create: { empresaId: autor.empresaId, ...campos },
    update: campos,
  });
  return paraPreferencias(linha);
}
