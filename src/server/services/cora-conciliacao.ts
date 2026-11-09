import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { logCora, logCoraErro } from "@/server/cora/log";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import { gravarCobrancaCora } from "./cora-cobranca";

const LOTE = 200;

export async function executarConciliacaoCora(opcoes: { empresaId?: string; clienteHttp?: ClienteHttpCora } = {}) {
  const empresas = await prisma.empresa.findMany({
    where: { provedorPagamento: "CORA", status: "ATIVA", ...(opcoes.empresaId ? { id: opcoes.empresaId } : {}) },
    select: { id: true },
  });
  let consultadas = 0;
  let atualizadas = 0;
  let falhas = 0;
  for (const empresa of empresas) {
    const faturas = await prisma.fatura.findMany({
      where: {
        empresaId: empresa.id,
        provedor: "CORA",
        excluida: false,
        idExterno: { not: null },
        statusNormalizado: { in: ["CRIANDO", "PENDENTE", "VENCIDO"] },
      },
      select: { id: true, idExterno: true, status: true },
      take: LOTE,
      orderBy: { vencimento: "asc" },
    });
    if (faturas.length === 0) continue;
    let provedor;
    try {
      provedor = await provedorDaEmpresa(empresa.id, undefined, undefined, opcoes.clienteHttp);
    } catch (erro) {
      falhas += 1;
      logCoraErro("conciliação sem conexão", {
        empresaId: empresa.id,
        codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
      });
      continue;
    }
    for (const fatura of faturas) {
      if (!fatura.idExterno) continue;
      try {
        const cobranca = await provedor.consultarCobranca(fatura.idExterno);
        consultadas += 1;
        if (cobranca.statusBruto !== fatura.status) {
          await gravarCobrancaCora(empresa.id, fatura.id, cobranca);
          atualizadas += 1;
        }
      } catch (erro) {
        falhas += 1;
        logCoraErro("falha ao conciliar fatura", {
          empresaId: empresa.id,
          faturaId: fatura.id,
          codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
        });
      }
    }
  }
  logCora("conciliação executada", { empresas: empresas.length, consultadas, atualizadas, falhas });
  return { empresas: empresas.length, consultadas, atualizadas, falhas };
}
