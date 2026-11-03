import { Prisma } from "@/generated/prisma/client";
import { dataHojeIso, dataIsoValida, isoDeData } from "@/lib/data";
import { compararDinheiro, normalizarDinheiro } from "@/lib/dinheiro";
import {
  faturaAceitaPromessa,
  inicioJanelaDias,
  metricasPromessaVazias,
  taxaCumprimento,
  type CanalPromessa,
  type MetricasPromessas,
  type StatusPromessa,
} from "@/lib/promessa";
import type { PromessaDTO, PromessaPendenteDTO } from "@/lib/tipos";
import { esquemaPromessa, esquemaSeloPromessa } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca, exigirVerFaturas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

export type AutorPromessa = AutorEmpresa & { usuarioId: string };

export type ResumoPromessasPainel = {
  vencemHoje: number;
  cumpridas90: number;
  quebradas90: number;
  taxa90: string | null;
  recentes: PromessaDTO[];
};

type LinhaMetrica = {
  abertas: number | bigint;
  valor_aberto: string;
  vencem_hoje: number | bigint;
  cumpridas: number | bigint;
  quebradas: number | bigint;
};

function empresaSql(empresaId: string | null) {
  return empresaId ? Prisma.sql`AND p.empresa_id = ${empresaId}` : Prisma.empty;
}

function conflitoPendente(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function numero(valor: number | bigint | null | undefined): number {
  if (typeof valor === "bigint") return Number(valor);
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  return 0;
}

const includeLista = {
  cliente: { select: { nomeFantasia: true } },
  fatura: { select: { valor: true, vencimento: true, status: true, excluida: true } },
  registradaPor: { select: { nome: true } },
} as const;

function paraPromessa(linha: {
  id: string;
  faturaId: string;
  clienteId: string;
  dataPrometida: Date;
  valorPrometido: { toFixed(casas: number): string };
  canal: CanalPromessa;
  observacao: string | null;
  status: StatusPromessa;
  registradaEm: Date;
  cliente: { nomeFantasia: string };
  fatura: { valor: { toFixed(casas: number): string }; vencimento: Date; status: string };
  registradaPor: { nome: string };
}): PromessaDTO {
  return {
    id: linha.id,
    faturaId: linha.faturaId,
    clienteId: linha.clienteId,
    nomeCliente: linha.cliente.nomeFantasia,
    valorFatura: linha.fatura.valor.toFixed(2),
    vencimentoFatura: isoDeData(linha.fatura.vencimento),
    statusFatura: linha.fatura.status,
    dataPrometida: isoDeData(linha.dataPrometida),
    valorPrometido: linha.valorPrometido.toFixed(2),
    canal: linha.canal,
    observacao: linha.observacao,
    status: linha.status,
    registradaPor: linha.registradaPor.nome,
    registradaEm: linha.registradaEm.toISOString(),
  };
}

function paraPendente(linha: {
  id: string;
  dataPrometida: Date;
  valorPrometido: { toFixed(casas: number): string };
  canal: CanalPromessa;
  observacao: string | null;
  registradaEm: Date;
  registradaPor: { nome: string };
}): PromessaPendenteDTO {
  return {
    id: linha.id,
    dataPrometida: isoDeData(linha.dataPrometida),
    valorPrometido: linha.valorPrometido.toFixed(2),
    canal: linha.canal,
    observacao: linha.observacao,
    registradaPor: linha.registradaPor.nome,
    registradaEm: linha.registradaEm.toISOString(),
  };
}

/**
 * Acerta o status das promessas da empresa. No cron, empresaId nulo percorre todas.
 * A SQL segue desfechoPromessa: cancela pendente de fatura cancelada, reabre
 * cumprida que deixou de estar paga, marca cumprida ou cumprida com atraso
 * quando há pagamento, e quebra o que passou do dia prometido.
 */
export async function conciliarPromessas(empresaId: string | null, hoje = dataHojeIso()): Promise<void> {
  if (!dataIsoValida(hoje)) return;
  const filtro = empresaSql(empresaId);

  await prisma.$executeRaw`
    UPDATE "promessas_pagamento" AS p
    SET
      "status" = 'CANCELADA'::"status_promessa_pagamento",
      "cancelada_em" = CURRENT_TIMESTAMP,
      "atualizado_em" = CURRENT_TIMESTAMP
    FROM "faturas" AS f
    WHERE f."id" = p."fatura_id"
      AND f."empresa_id" = p."empresa_id"
      AND p."status"::text = 'PENDENTE'
      AND f."excluida" = true
      ${filtro}
  `;

  await prisma.$executeRaw`
    UPDATE "promessas_pagamento" AS p
    SET
      "status" = CASE
        WHEN p."data_prometida" < ${hoje}::date THEN 'QUEBRADA'::"status_promessa_pagamento"
        ELSE 'PENDENTE'::"status_promessa_pagamento"
      END,
      "cumprida_em" = NULL,
      "quebrada_em" = CASE
        WHEN p."data_prometida" < ${hoje}::date THEN ${hoje}::date
        ELSE NULL
      END,
      "atualizado_em" = CURRENT_TIMESTAMP
    FROM "faturas" AS f
    WHERE f."id" = p."fatura_id"
      AND f."empresa_id" = p."empresa_id"
      AND p."status"::text IN ('CUMPRIDA', 'CUMPRIDA_COM_ATRASO')
      AND f."excluida" = false
      AND f."status_normalizado" IS DISTINCT FROM 'PAGO'
      ${filtro}
  `;

  await prisma.$executeRaw`
    UPDATE "promessas_pagamento" AS p
    SET
      "status" = CASE
        WHEN COALESCE(f."pago_em", (f."atualizado_em" AT TIME ZONE 'America/Sao_Paulo')::date) <= p."data_prometida"
          THEN 'CUMPRIDA'::"status_promessa_pagamento"
        ELSE 'CUMPRIDA_COM_ATRASO'::"status_promessa_pagamento"
      END,
      "cumprida_em" = COALESCE(f."pago_em", (f."atualizado_em" AT TIME ZONE 'America/Sao_Paulo')::date),
      "quebrada_em" = NULL,
      "atualizado_em" = CURRENT_TIMESTAMP
    FROM "faturas" AS f
    WHERE f."id" = p."fatura_id"
      AND f."empresa_id" = p."empresa_id"
      AND p."status"::text IN ('PENDENTE', 'QUEBRADA')
      AND f."excluida" = false
      AND f."status_normalizado" = 'PAGO'
      ${filtro}
  `;

  await prisma.$executeRaw`
    UPDATE "promessas_pagamento" AS p
    SET
      "status" = 'QUEBRADA'::"status_promessa_pagamento",
      "quebrada_em" = ${hoje}::date,
      "atualizado_em" = CURRENT_TIMESTAMP
    WHERE p."status"::text = 'PENDENTE'
      AND p."data_prometida" < ${hoje}::date
      ${filtro}
  `;
}

export async function faturaIdsComPromessaAtiva(empresaId: string, hoje: string): Promise<Set<string>> {
  if (!dataIsoValida(hoje)) return new Set();
  const linhas = await prisma.promessaPagamento.findMany({
    where: {
      empresaId,
      status: "PENDENTE",
      dataPrometida: { gte: new Date(`${hoje}T00:00:00.000Z`) },
    },
    select: { faturaId: true },
  });
  return new Set(linhas.map((linha) => linha.faturaId));
}

async function carregar(empresaId: string, id: string) {
  const promessa = await prisma.promessaPagamento.findFirst({
    where: { id, empresaId },
    include: includeLista,
  });
  if (!promessa) throw new ErroAplicacao("Promessa não encontrada.", 404, "nao_encontrado");
  return promessa;
}

function validarCampos(dataPrometida: string, valor: string, valorFatura: string, hoje: string) {
  if (!dataIsoValida(dataPrometida) || dataPrometida < hoje) {
    throw new ErroAplicacao("A data prometida precisa ser hoje ou uma data futura.", 400, "validacao", {
      dataPrometida: "A data prometida precisa ser hoje ou uma data futura.",
    });
  }
  const normal = normalizarDinheiro(valor);
  if (!normal || compararDinheiro(normal, "0.00") <= 0) {
    throw new ErroAplicacao("Informe um valor prometido maior que zero.", 400, "validacao", {
      valorPrometido: "Informe um valor prometido maior que zero.",
    });
  }
  if (compararDinheiro(normal, valorFatura) > 0) {
    throw new ErroAplicacao("O valor prometido não pode passar do valor da fatura.", 400, "validacao", {
      valorPrometido: "O valor prometido não pode passar do valor da fatura.",
    });
  }
  return normal;
}

export async function registrarPromessa(autor: AutorPromessa, faturaId: string, entrada: unknown, agora = new Date()) {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaPromessa, entrada);
  const hoje = dataHojeIso(agora);
  const [fatura, usuario] = await Promise.all([
    prisma.fatura.findFirst({
      where: { id: faturaId, empresaId: autor.empresaId },
      select: { id: true, clienteId: true, valor: true, status: true, excluida: true },
    }),
    prisma.usuario.findFirst({
      where: { id: autor.usuarioId, empresaId: autor.empresaId },
      select: { id: true },
    }),
  ]);
  if (!fatura) throw new ErroAplicacao("Cobrança não encontrada.", 404, "nao_encontrado");
  if (!usuario) throw new ErroAplicacao("Só alguém desta empresa pode registrar a promessa.", 403, "sem_permissao");
  if (!faturaAceitaPromessa(fatura.status, fatura.excluida)) {
    throw new ErroAplicacao("Só dá para prometer em fatura em aberto ou vencida.", 409, "fatura_encerrada");
  }
  const valor = validarCampos(dados.dataPrometida, dados.valorPrometido, fatura.valor.toFixed(2), hoje);
  try {
    const criada = await prisma.promessaPagamento.create({
      data: {
        empresaId: autor.empresaId,
        faturaId: fatura.id,
        clienteId: fatura.clienteId,
        dataPrometida: new Date(`${dados.dataPrometida}T00:00:00.000Z`),
        valorPrometido: valor,
        canal: dados.canal,
        observacao: dados.observacao.trim() ? dados.observacao.trim() : null,
        status: "PENDENTE",
        registradaPorId: usuario.id,
      },
      include: includeLista,
    });
    return paraPromessa(criada);
  } catch (erro) {
    if (conflitoPendente(erro)) {
      throw new ErroAplicacao("Esta fatura já tem uma promessa pendente.", 409, "promessa_pendente");
    }
    throw erro;
  }
}

export async function editarPromessa(autor: AutorPromessa, id: string, entrada: unknown, agora = new Date()) {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaPromessa, entrada);
  const hoje = dataHojeIso(agora);
  const atual = await carregar(autor.empresaId, id);
  if (atual.status !== "PENDENTE") {
    throw new ErroAplicacao("Só dá para editar uma promessa pendente.", 409, "promessa_encerrada");
  }
  if (!faturaAceitaPromessa(atual.fatura.status, atual.fatura.excluida)) {
    throw new ErroAplicacao("A fatura não está mais em aberto.", 409, "fatura_encerrada");
  }
  const valor = validarCampos(dados.dataPrometida, dados.valorPrometido, atual.fatura.valor.toFixed(2), hoje);
  const salva = await prisma.promessaPagamento.update({
    where: { id: atual.id },
    data: {
      dataPrometida: new Date(`${dados.dataPrometida}T00:00:00.000Z`),
      valorPrometido: valor,
      canal: dados.canal,
      observacao: dados.observacao.trim() ? dados.observacao.trim() : null,
    },
    include: includeLista,
  });
  return paraPromessa(salva);
}

export async function cancelarPromessa(autor: AutorPromessa, id: string) {
  exigirCobranca(autor);
  const atual = await carregar(autor.empresaId, id);
  if (atual.status !== "PENDENTE") {
    throw new ErroAplicacao("Só dá para cancelar uma promessa pendente.", 409, "promessa_encerrada");
  }
  const salva = await prisma.promessaPagamento.update({
    where: { id: atual.id },
    data: { status: "CANCELADA", canceladaEm: new Date() },
    include: includeLista,
  });
  return paraPromessa(salva);
}

export async function listarPromessas(
  autor: AutorEmpresa,
  filtro: { situacao?: string; clienteId?: string; faturaId?: string } = {},
  agora = new Date(),
): Promise<PromessaDTO[]> {
  exigirVerFaturas(autor);
  const hoje = dataHojeIso(agora);
  await conciliarPromessas(autor.empresaId, hoje);
  const situacao = filtro.situacao ?? "pendentes";
  const ondeStatus =
    situacao === "hoje"
      ? { status: "PENDENTE" as const, dataPrometida: new Date(`${hoje}T00:00:00.000Z`) }
      : situacao === "cumpridas"
        ? { status: { in: ["CUMPRIDA" as const, "CUMPRIDA_COM_ATRASO" as const] } }
        : situacao === "quebradas"
          ? { status: "QUEBRADA" as const }
          : situacao === "canceladas"
            ? { status: "CANCELADA" as const }
            : situacao === "todas"
              ? {}
              : { status: "PENDENTE" as const };
  const linhas = await prisma.promessaPagamento.findMany({
    where: {
      empresaId: autor.empresaId,
      ...ondeStatus,
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.faturaId ? { faturaId: filtro.faturaId } : {}),
    },
    include: includeLista,
    orderBy: situacao === "pendentes" || situacao === "hoje" ? { dataPrometida: "asc" } : { dataPrometida: "desc" },
    take: 200,
  });
  return linhas.map(paraPromessa);
}

export async function promessasPendentesDasFaturas(
  empresaId: string,
  faturaIds: string[],
): Promise<Map<string, PromessaPendenteDTO>> {
  const mapa = new Map<string, PromessaPendenteDTO>();
  if (faturaIds.length === 0) return mapa;
  const linhas = await prisma.promessaPagamento.findMany({
    where: { empresaId, faturaId: { in: faturaIds }, status: "PENDENTE" },
    select: {
      id: true,
      faturaId: true,
      dataPrometida: true,
      valorPrometido: true,
      canal: true,
      observacao: true,
      registradaEm: true,
      registradaPor: { select: { nome: true } },
    },
  });
  for (const linha of linhas) mapa.set(linha.faturaId, paraPendente(linha));
  return mapa;
}

export async function obterMetricasPromessas(
  autor: AutorEmpresa,
  filtro: { inicio: string; fim: string; hoje: string; forma: string | null; statusCliente: string | null },
): Promise<MetricasPromessas> {
  exigirVerFaturas(autor);
  if (!dataIsoValida(filtro.inicio) || !dataIsoValida(filtro.fim) || !dataIsoValida(filtro.hoje)) {
    return metricasPromessaVazias(filtro.inicio, filtro.fim);
  }
  await conciliarPromessas(autor.empresaId, filtro.hoje);
  const formaSql = filtro.forma ? Prisma.sql`AND f.forma_cobranca = ${filtro.forma}` : Prisma.empty;
  const statusSql = filtro.statusCliente ? Prisma.sql`AND c.status::text = ${filtro.statusCliente}` : Prisma.empty;
  const linhas = await prisma.$queryRaw<LinhaMetrica[]>`
    SELECT
      COUNT(*) FILTER (WHERE p.status::text = 'PENDENTE') AS abertas,
      COALESCE(SUM(p.valor_prometido) FILTER (WHERE p.status::text = 'PENDENTE'), 0)::text AS valor_aberto,
      COUNT(*) FILTER (
        WHERE p.status::text = 'PENDENTE' AND p.data_prometida = ${filtro.hoje}::date
      ) AS vencem_hoje,
      COUNT(*) FILTER (
        WHERE p.status::text IN ('CUMPRIDA', 'CUMPRIDA_COM_ATRASO')
          AND p.data_prometida >= ${filtro.inicio}::date
          AND p.data_prometida <= ${filtro.fim}::date
      ) AS cumpridas,
      COUNT(*) FILTER (
        WHERE p.status::text = 'QUEBRADA'
          AND p.data_prometida >= ${filtro.inicio}::date
          AND p.data_prometida <= ${filtro.fim}::date
      ) AS quebradas
    FROM promessas_pagamento p
    INNER JOIN faturas f ON f.id = p.fatura_id AND f.empresa_id = p.empresa_id
    INNER JOIN clientes c ON c.id = p.cliente_id AND c.empresa_id = p.empresa_id
    WHERE p.empresa_id = ${autor.empresaId}
      ${formaSql}
      ${statusSql}
  `;
  const linha = linhas[0];
  const cumpridas = numero(linha?.cumpridas);
  const quebradas = numero(linha?.quebradas);
  const valor = normalizarDinheiro(linha?.valor_aberto ?? "0") ?? "0.00";
  return {
    abertas: numero(linha?.abertas),
    valorAberto: valor,
    vencemHoje: numero(linha?.vencem_hoje),
    cumpridas,
    quebradas,
    taxa: taxaCumprimento(cumpridas, quebradas),
    inicio: filtro.inicio,
    fim: filtro.fim,
  };
}

export async function obterResumoPromessasPainel(empresaId: string, agora = new Date()): Promise<ResumoPromessasPainel> {
  const hoje = dataHojeIso(agora);
  await conciliarPromessas(empresaId, hoje);
  const inicio90 = inicioJanelaDias(hoje, 90);
  const inicioRecente = inicioJanelaDias(hoje, 14);
  const [vencemHoje, cumpridas90, quebradas90, recentes] = await Promise.all([
    prisma.promessaPagamento.count({
      where: { empresaId, status: "PENDENTE", dataPrometida: new Date(`${hoje}T00:00:00.000Z`) },
    }),
    prisma.promessaPagamento.count({
      where: {
        empresaId,
        status: { in: ["CUMPRIDA", "CUMPRIDA_COM_ATRASO"] },
        dataPrometida: {
          gte: new Date(`${inicio90}T00:00:00.000Z`),
          lte: new Date(`${hoje}T00:00:00.000Z`),
        },
      },
    }),
    prisma.promessaPagamento.count({
      where: {
        empresaId,
        status: "QUEBRADA",
        dataPrometida: {
          gte: new Date(`${inicio90}T00:00:00.000Z`),
          lte: new Date(`${hoje}T00:00:00.000Z`),
        },
      },
    }),
    prisma.promessaPagamento.findMany({
      where: {
        empresaId,
        status: "QUEBRADA",
        dataPrometida: { gte: new Date(`${inicioRecente}T00:00:00.000Z`) },
      },
      include: includeLista,
      orderBy: { dataPrometida: "desc" },
      take: 8,
    }),
  ]);
  return {
    vencemHoje,
    cumpridas90,
    quebradas90,
    taxa90: taxaCumprimento(cumpridas90, quebradas90),
    recentes: recentes.map(paraPromessa),
  };
}

export async function salvarAjusteSeloPromessa(autor: AutorEmpresa, entrada: unknown) {
  if (autor.papel !== "DONO") {
    throw new ErroAplicacao("Só o dono da empresa pode mudar esta regra.", 403, "sem_permissao");
  }
  const dados = lerEsquema(esquemaSeloPromessa, entrada);
  await prisma.empresa.update({
    where: { id: autor.empresaId },
    data: { promessasContamNoSelo: dados.contarNoSelo },
  });
  return { contarNoSelo: dados.contarNoSelo };
}
