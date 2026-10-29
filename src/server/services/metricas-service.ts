import { dataHojeIso, isoDeData } from "@/lib/data";
import { fimDaAssinatura, fimDoCliente, calcularMetricas, type MetricasSaas } from "@/lib/metricas-saas";
import { exigirMetricas, type AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";

export async function obterMetricas(autor: AutorEmpresa, agora = new Date()): Promise<MetricasSaas> {
  exigirMetricas(autor);
  const linhas = await prisma.clienteServico.findMany({
    where: { empresaId: autor.empresaId, recorrencia: "MENSAL" },
    select: {
      clienteId: true,
      valor: true,
      inicioEm: true,
      status: true,
      asaasAssinaturaStatus: true,
      atualizadoEm: true,
      cliente: { select: { status: true, atualizadoEm: true, ativadoEm: true } },
    },
  });

  return calcularMetricas(
    dataHojeIso(agora),
    linhas.map((linha) => {
      const atualizado = dataHojeIso(linha.atualizadoEm);
      return {
        clienteId: linha.clienteId,
        valor: linha.valor.toString(),
        inicio: isoDeData(linha.inicioEm),
        fim: fimDaAssinatura(linha.status, linha.asaasAssinaturaStatus, atualizado),
        clienteFim: fimDoCliente(linha.cliente.status, dataHojeIso(linha.cliente.atualizadoEm)),
        ativacao: linha.cliente.ativadoEm ? isoDeData(linha.cliente.ativadoEm) : null,
      };
    }),
  );
}
