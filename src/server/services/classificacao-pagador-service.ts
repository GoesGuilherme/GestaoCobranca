import { classificarPagador, inicioDaJanela, type FaturaParaClassificar, type ResultadoClassificacaoPagador } from "@/lib/classificacao-pagador";
import { dataHojeIso, isoDeData } from "@/lib/data";
import { prisma } from "@/server/db";
import { conciliarPromessas } from "@/server/services/promessa-service";

export async function classificarPagadoresDaEmpresa(
  empresaId: string,
  clienteIds: string[],
  hoje = dataHojeIso(),
): Promise<Map<string, ResultadoClassificacaoPagador | null>> {
  const unicos = [...new Set(clienteIds)];
  const mapa = new Map<string, ResultadoClassificacaoPagador | null>();
  for (const id of unicos) mapa.set(id, null);
  if (unicos.length === 0) return mapa;

  const inicio = inicioDaJanela(hoje);
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { promessasContamNoSelo: true },
  });
  const contarPromessas = empresa?.promessasContamNoSelo === true;
  if (contarPromessas) await conciliarPromessas(empresaId, hoje);

  const [faturas, promessas] = await Promise.all([
    prisma.fatura.findMany({
    where: {
      empresaId,
      clienteId: { in: unicos },
      vencimento: {
        gte: new Date(`${inicio}T00:00:00.000Z`),
        lte: new Date(`${hoje}T00:00:00.000Z`),
      },
    },
    select: {
      clienteId: true,
      vencimento: true,
      pagoEm: true,
      status: true,
      excluida: true,
    },
  }),
    contarPromessas
      ? prisma.promessaPagamento.groupBy({
          by: ["clienteId"],
          where: {
            empresaId,
            clienteId: { in: unicos },
            status: "QUEBRADA",
            dataPrometida: {
              gte: new Date(`${inicio}T00:00:00.000Z`),
              lte: new Date(`${hoje}T00:00:00.000Z`),
            },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const quebradas = new Map<string, number>();
  for (const grupo of promessas) quebradas.set(grupo.clienteId, grupo._count._all);

  const porCliente = new Map<string, FaturaParaClassificar[]>();
  for (const fatura of faturas) {
    const lista = porCliente.get(fatura.clienteId) ?? [];
    lista.push({
      vencimento: isoDeData(fatura.vencimento),
      pagoEm: fatura.pagoEm ? isoDeData(fatura.pagoEm) : null,
      status: fatura.status,
      excluida: fatura.excluida,
    });
    porCliente.set(fatura.clienteId, lista);
  }

  for (const id of unicos) {
    const quantidade = quebradas.get(id) ?? 0;
    mapa.set(
      id,
      classificarPagador(porCliente.get(id) ?? [], hoje, quantidade > 0 ? { quebradas: quantidade } : undefined),
    );
  }
  return mapa;
}
