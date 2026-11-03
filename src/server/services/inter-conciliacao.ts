import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { logInter, logInterErro } from "@/server/inter/log";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import { gravarCobrancaInter } from "./inter-cobranca";

const LOTE = 200;

export async function executarConciliacaoInter(opcoes: { empresaId?: string; clienteHttp?: ClienteHttpInter } = {}) {
  const empresas = await prisma.empresa.findMany({
    where: { provedorPagamento: "INTER", status: "ATIVA", ...(opcoes.empresaId ? { id: opcoes.empresaId } : {}) },
    select: { id: true },
  });
  let consultadas = 0;
  let atualizadas = 0;
  let falhas = 0;
  for (const empresa of empresas) {
    const faturas = await prisma.fatura.findMany({
      where: {
        empresaId: empresa.id,
        provedor: "INTER",
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
      provedor = await provedorDaEmpresa(empresa.id, undefined, opcoes.clienteHttp);
    } catch (erro) {
      falhas += 1;
      logInterErro("conciliação sem conexão", {
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
          await gravarCobrancaInter(empresa.id, fatura.id, cobranca);
          atualizadas += 1;
        }
      } catch (erro) {
        falhas += 1;
        logInterErro("falha ao conciliar cobrança", {
          empresaId: empresa.id,
          faturaId: fatura.id,
          codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
        });
      }
    }
  }
  logInter("conciliação executada", { empresas: empresas.length, consultadas, atualizadas, falhas });
  return { empresas: empresas.length, consultadas, atualizadas, falhas };
}
