import { Prisma } from "@/generated/prisma/client";
import {
  mesesDoHorizonte,
  montarBocaJacare,
  type BocaJacare,
  type HorizonteBoca,
  type LinhaBoca,
} from "@/lib/boca-jacare";
import { dataHojeIso } from "@/lib/data";
import { exigirVerFaturas, type AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";

type LinhaSql = {
  mes: string;
  faturado: string;
  recebido: string;
  inadimplente: string;
  a_vencer: string;
};

type ResumoSql = {
  inadimplente: string;
  base: string;
};

function texto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "bigint") return valor.toString();
  if (valor && typeof valor === "object" && "toString" in valor) {
    const convertido = valor.toString();
    if (convertido !== "[object Object]") return convertido;
  }
  return "0.00";
}

function fimDoMes(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
}

// Uma leitura por empresa. CRIANDO ainda não é cobrança emitida.
// Estorno e fatura excluída ficam de fora do faturado.
function trechos(hoje: string) {
  const faturavel = Prisma.sql`f.excluida = false AND f.status_normalizado IS DISTINCT FROM 'CRIANDO' AND f.status_normalizado IS DISTINCT FROM 'ESTORNADO'`;
  // Parte paga da coorte do vencimento, não o caixa do mês. pago_em não muda
  // o mês da linha: o cartão "Recebido no mês" é que soma pela data de pagamento.
  const recebido = Prisma.sql`${faturavel} AND f.status_normalizado = 'PAGO'`;
  const inadimplente = Prisma.sql`f.excluida = false AND (
    f.status_normalizado = 'VENCIDO'
    OR (f.status_normalizado = 'PENDENTE' AND f.vencimento < ${hoje}::date)
  )`;
  const aVencer = Prisma.sql`f.excluida = false AND f.status_normalizado = 'PENDENTE' AND f.vencimento >= ${hoje}::date`;
  const base = Prisma.sql`${faturavel} AND (
    f.vencimento < ${hoje}::date
    OR f.status_normalizado = 'VENCIDO'
  )`;
  return { faturavel, recebido, inadimplente, aVencer, base };
}

export async function obterBocaJacare(
  autor: AutorEmpresa,
  horizonte: HorizonteBoca = 12,
  agora = new Date(),
): Promise<BocaJacare> {
  exigirVerFaturas(autor);
  const hoje = dataHojeIso(agora);
  const meses = mesesDoHorizonte(hoje, horizonte);
  const inicio = `${meses[0]}-01`;
  const fim = fimDoMes(meses[meses.length - 1] ?? hoje.slice(0, 7));
  const partes = trechos(hoje);

  const [linhas, resumo] = await Promise.all([
    prisma.$queryRaw<LinhaSql[]>(Prisma.sql`
      SELECT
        to_char(f.vencimento, 'YYYY-MM') AS mes,
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.faturavel}), 0)::text AS faturado,
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.recebido}), 0)::text AS recebido,
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.inadimplente}), 0)::text AS inadimplente,
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.aVencer}), 0)::text AS a_vencer
      FROM faturas f
      WHERE f.empresa_id = ${autor.empresaId}
        AND f.vencimento >= ${inicio}::date
        AND f.vencimento <= ${fim}::date
      GROUP BY 1
    `),
    prisma.$queryRaw<ResumoSql[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.inadimplente}), 0)::text AS inadimplente,
        COALESCE(SUM(f.valor) FILTER (WHERE ${partes.base}), 0)::text AS base
      FROM faturas f
      WHERE f.empresa_id = ${autor.empresaId}
    `),
  ]);

  const agregadas: LinhaBoca[] = linhas.map((linha) => ({
    mes: texto(linha.mes),
    faturado: texto(linha.faturado),
    recebido: texto(linha.recebido),
    inadimplente: texto(linha.inadimplente),
    aVencer: texto(linha.a_vencer),
  }));
  const estoque = resumo[0];

  return montarBocaJacare({
    linhas: agregadas,
    horizonte,
    hoje,
    resumo: {
      inadimplente: texto(estoque?.inadimplente),
      base: texto(estoque?.base),
    },
  });
}
