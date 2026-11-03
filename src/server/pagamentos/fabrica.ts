import { abrirClienteAsaas } from "@/server/asaas/abrir";
import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import { ErroAplicacao } from "@/server/erros";
import { AdaptadorAsaas } from "./asaas-adaptador";
import { PROVEDORES_DISPONIVEIS, type ProvedorId, type ProvedorPagamento, provedorConhecido } from "./contrato";
import { prisma } from "@/server/db";

export type ContextoProvedor = {
  provedor: ProvedorPagamento;
  http: ClienteHttpAsaas | null;
};

/**
 * Conectores além do Asaas se registram aqui. A Cora entra com
 * confirmarBaixaPorConsulta e sem assinatura nativa.
 */
const conectores: Partial<Record<ProvedorId, (empresaId: string) => Promise<ProvedorPagamento>>> = {};

export function registrarConector(provedor: ProvedorId, criar: (empresaId: string) => Promise<ProvedorPagamento>) {
  conectores[provedor] = criar;
}

export async function provedorEscolhido(empresaId: string): Promise<ProvedorId> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { provedorPagamento: true },
  });
  const codigo = (empresa?.provedorPagamento ?? "ASAAS").trim().toUpperCase();
  if (!provedorConhecido(codigo)) {
    throw new ErroAplicacao("Provedor de pagamento desconhecido.", 409, "provedor_desconhecido");
  }
  return codigo;
}

export async function definirProvedorPagamento(empresaId: string, provedor: string): Promise<ProvedorId> {
  const codigo = provedor.trim().toUpperCase();
  if (!provedorConhecido(codigo) || !(PROVEDORES_DISPONIVEIS as readonly string[]).includes(codigo)) {
    throw new ErroAplicacao(
      "Este provedor ainda não está disponível. Hoje a empresa usa somente o Asaas.",
      409,
      "provedor_indisponivel",
    );
  }
  await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: codigo } });
  return codigo;
}

export async function provedorDaEmpresa(empresaId: string, httpInjetado?: ClienteHttpAsaas): Promise<ContextoProvedor> {
  const codigo = await provedorEscolhido(empresaId);
  if (codigo === "ASAAS") {
    const { http } = await abrirClienteAsaas(empresaId, httpInjetado);
    return { provedor: new AdaptadorAsaas(http), http };
  }
  const criar = conectores[codigo];
  if (!criar) {
    throw new ErroAplicacao(
      "Este provedor ainda não está disponível. Hoje a empresa usa somente o Asaas.",
      409,
      "provedor_indisponivel",
    );
  }
  return { provedor: await criar(empresaId), http: null };
}
