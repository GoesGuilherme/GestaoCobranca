import type { ContagemSegmento, Painel, StatusCliente } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { paraCliente } from "./mapeadores";

const STATUS: StatusCliente[] = ["ATIVO", "INATIVO", "EM_IMPLANTACAO", "BLOQUEADO"];
const SEM_SEGMENTO = "Sem segmento da empresa";

export async function obterPainel(empresaId: string): Promise<Painel> {
  const onde = { empresaId };
  const [totalClientes, totalFiliais, porStatusBruto, porSegmentoBruto, recentes, mensais, cadastrados] =
    await Promise.all([
      prisma.cliente.count({ where: onde }),
      prisma.filial.count({ where: { cliente: onde } }),
      prisma.cliente.groupBy({ by: ["status"], where: onde, _count: true }),
      prisma.cliente.groupBy({ by: ["segmentoId"], where: onde, _count: true }),
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
          segmentoCadastrado: { select: { nome: true, cor: true } },
        },
      }),
      prisma.clienteServico.aggregate({
        where: { empresaId, status: "ATIVO", recorrencia: "MENSAL" },
        _sum: { valor: true },
      }),
      prisma.segmentoCliente.findMany({
        where: { empresaId },
        select: { id: true, nome: true, cor: true },
      }),
    ]);

  const porStatus = Object.fromEntries(STATUS.map((status) => [status, 0])) as Painel["porStatus"];
  for (const item of porStatusBruto) {
    porStatus[item.status] = item._count;
  }

  const porId = new Map(cadastrados.map((segmento) => [segmento.id, segmento]));
  const porSegmento: ContagemSegmento[] = porSegmentoBruto
    .map((item) => {
      if (!item.segmentoId) {
        return { id: null, nome: SEM_SEGMENTO, cor: null, quantidade: item._count };
      }
      const cadastro = porId.get(item.segmentoId);
      return {
        id: item.segmentoId,
        nome: cadastro?.nome ?? "Segmento removido",
        cor: cadastro?.cor ?? null,
        quantidade: item._count,
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    totalClientes,
    totalFiliais,
    porStatus,
    porSegmento,
    recentes: recentes.map(paraCliente),
    receitaMensal: mensais._sum.valor ? mensais._sum.valor.toFixed(2) : "0.00",
  };
}
