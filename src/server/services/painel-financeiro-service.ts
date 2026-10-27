import { Prisma } from "@/generated/prisma/client";
import { dataHojeIso } from "@/lib/data";
import {
  intervaloPeriodo,
  mesesDoGrafico,
  montarPainelFinanceiro,
  STATUS_ESTORNO,
  type AssinaturaPainel,
  type FaturaPainel,
  type FiltrosPainel,
  type PainelFinanceiro,
} from "@/lib/painel-financeiro";
import { exigirVerFaturas, type AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";

type LinhaFatura = {
  id: string;
  status: string;
  excluida: boolean;
  valor: string;
  vencimento: string;
  atualizado_em: string;
  forma_cobranca: string;
  cliente_servico_id: string | null;
  cliente_id: string;
  nome_fantasia: string;
};

type LinhaAssinatura = {
  id: string;
  valor: string;
  dia_vencimento: number | null;
  proximo_vencimento: string | null;
};

type LinhaMes = {
  id: string;
  mes: string;
};

function texto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "bigint") return valor.toString();
  return "";
}

export async function obterPainelFinanceiro(
  autor: AutorEmpresa,
  filtros: FiltrosPainel,
  agora = new Date(),
): Promise<PainelFinanceiro> {
  exigirVerFaturas(autor);
  const hoje = dataHojeIso(agora);
  const meses = mesesDoGrafico(hoje);
  const inicioGrafico = `${meses[0]}-01`;
  const fimGrafico = fimDoMes(meses[meses.length - 1] ?? hoje.slice(0, 7));
  const periodo = intervaloPeriodo(filtros.periodo, hoje);
  const inicioAtual = `${hoje.slice(0, 7)}-01`;
  const formaSql = filtros.forma ? Prisma.sql`AND f.forma_cobranca = ${filtros.forma}` : Prisma.empty;
  const statusSql = filtros.statusCliente ? Prisma.sql`AND c.status::text = ${filtros.statusCliente}` : Prisma.empty;
  const formaAssinatura = filtros.forma
    ? Prisma.sql`AND cs.forma_cobranca_recorrente = ${filtros.forma}`
    : Prisma.empty;

  const faturas = await prisma.$queryRaw<LinhaFatura[]>(Prisma.sql`
      SELECT
        f.id,
        f.status,
        f.excluida,
        f.valor::text AS valor,
        to_char(f.vencimento, 'YYYY-MM-DD') AS vencimento,
        to_char(f.atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS atualizado_em,
        f.forma_cobranca,
        f.cliente_servico_id,
        c.id AS cliente_id,
        c.nome_fantasia
      FROM faturas f
      INNER JOIN clientes c ON c.id = f.cliente_id
      WHERE f.empresa_id = ${autor.empresaId}
        AND c.empresa_id = ${autor.empresaId}
        AND f.excluida = false
        AND f.status NOT IN (${Prisma.join([...STATUS_ESTORNO])})
        ${formaSql}
        ${statusSql}
        AND (
          (f.vencimento >= ${inicioGrafico}::date AND f.vencimento <= ${fimGrafico}::date)
          OR (
            (f.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date >= ${periodo.inicio}::date
            AND (f.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date <= ${periodo.fim}::date
          )
        )
    `);
  const assinaturas = await prisma.$queryRaw<LinhaAssinatura[]>(Prisma.sql`
      SELECT
        cs.id,
        cs.valor::text AS valor,
        cs.dia_vencimento,
        to_char(cs.proximo_vencimento, 'YYYY-MM-DD') AS proximo_vencimento
      FROM clientes_servicos cs
      INNER JOIN clientes c ON c.id = cs.cliente_id
      WHERE cs.empresa_id = ${autor.empresaId}
        AND c.empresa_id = ${autor.empresaId}
        AND cs.status = 'ATIVO'
        AND cs.recorrencia = 'MENSAL'
        AND cs.asaas_assinatura_status = 'ACTIVE'
        ${formaAssinatura}
        ${statusSql}
    `);
  const mesesOcupados = await prisma.$queryRaw<LinhaMes[]>(Prisma.sql`
      SELECT f.cliente_servico_id AS id, to_char(f.vencimento, 'YYYY-MM') AS mes
      FROM faturas f
      WHERE f.empresa_id = ${autor.empresaId}
        AND f.excluida = false
        AND f.cliente_servico_id IS NOT NULL
        AND f.vencimento >= ${inicioAtual}::date
        AND f.vencimento <= ${fimGrafico}::date
    `);

  const ocupados = new Map<string, string[]>();
  for (const linha of mesesOcupados) {
    const id = texto(linha.id);
    const mes = texto(linha.mes);
    if (!id || !mes) continue;
    const lista = ocupados.get(id) ?? [];
    lista.push(mes);
    ocupados.set(id, lista);
  }

  const faturasPainel: FaturaPainel[] = faturas.map((linha) => ({
    id: texto(linha.id),
    status: texto(linha.status),
    excluida: Boolean(linha.excluida),
    valor: texto(linha.valor),
    vencimento: texto(linha.vencimento),
    atualizadoEm: texto(linha.atualizado_em),
    formaCobranca: texto(linha.forma_cobranca),
    clienteServicoId: linha.cliente_servico_id ? texto(linha.cliente_servico_id) : null,
    clienteId: texto(linha.cliente_id),
    clienteNome: texto(linha.nome_fantasia),
  }));

  const assinaturasPainel: AssinaturaPainel[] = assinaturas.map((linha) => ({
    id: texto(linha.id),
    valor: texto(linha.valor),
    diaVencimento: linha.dia_vencimento === null ? null : Number(linha.dia_vencimento),
    proximoVencimento: linha.proximo_vencimento ? texto(linha.proximo_vencimento) : null,
    mesesComFatura: ocupados.get(texto(linha.id)) ?? [],
  }));

  return montarPainelFinanceiro({
    faturas: faturasPainel,
    assinaturas: assinaturasPainel,
    periodo: filtros.periodo,
    hoje,
  });
}

function fimDoMes(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
}
