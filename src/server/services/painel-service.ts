import type { Painel, Segmento, StatusCliente } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { paraCliente } from "./mapeadores";

const STATUS: StatusCliente[] = ["ATIVO", "INATIVO", "EM_IMPLANTACAO"];
const SEGMENTOS: Segmento[] = ["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"];

export async function obterPainel(empresaId: string): Promise<Painel> {
  const onde = { empresaId };
  const [totalClientes, totalFiliais, porStatusBruto, porSegmentoBruto, recentes, mensais] =
    await Promise.all([
      prisma.cliente.count({ where: onde }),
      prisma.filial.count({ where: { cliente: onde } }),
      prisma.cliente.groupBy({ by: ["status"], where: onde, _count: true }),
      prisma.cliente.groupBy({ by: ["segmento"], where: onde, _count: true }),
      prisma.cliente.findMany({
        where: onde,
        orderBy: { criadoEm: "desc" },
        take: 5,
        include: {
          _count: { select: { filiais: true } },
          servicos: {
            where: { status: "ATIVO", recorrencia: "MENSAL" },
            select: { valor: true },
          },
        },
      }),
      prisma.clienteServico.aggregate({
        where: { empresaId, status: "ATIVO", recorrencia: "MENSAL" },
        _sum: { valor: true },
      }),
    ]);

  const porStatus = Object.fromEntries(STATUS.map((status) => [status, 0])) as Painel["porStatus"];
  for (const item of porStatusBruto) {
    porStatus[item.status] = item._count;
  }

  const porSegmento = Object.fromEntries(
    SEGMENTOS.map((segmento) => [segmento, 0]),
  ) as Painel["porSegmento"];
  for (const item of porSegmentoBruto) {
    porSegmento[item.segmento] = item._count;
  }

  return {
    totalClientes,
    totalFiliais,
    porStatus,
    porSegmento,
    recentes: recentes.map(paraCliente),
    receitaMensal: mensais._sum.valor ? mensais._sum.valor.toFixed(2) : "0.00",
  };
}
