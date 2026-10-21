import type { Painel, Segmento, StatusCliente } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { paraCliente } from "./mapeadores";

const STATUS: StatusCliente[] = ["ATIVO", "INATIVO", "EM_IMPLANTACAO"];
const SEGMENTOS: Segmento[] = ["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"];

export async function obterPainel(): Promise<Painel> {
  const [totalClientes, totalFiliais, porStatusBruto, porSegmentoBruto, recentes] =
    await Promise.all([
      prisma.cliente.count(),
      prisma.filial.count(),
      prisma.cliente.groupBy({ by: ["status"], _count: true }),
      prisma.cliente.groupBy({ by: ["segmento"], _count: true }),
      prisma.cliente.findMany({
        orderBy: { criadoEm: "desc" },
        take: 5,
        include: { _count: { select: { filiais: true } } },
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
  };
}
