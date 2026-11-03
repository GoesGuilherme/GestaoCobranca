import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import { abrirClienteAsaas } from "@/server/asaas/abrir";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { abrirClienteInter } from "@/server/inter/abrir";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { provedorCodigo } from "@/lib/status-pagamento";
import { provedorEstaDisponivel } from "./capacidades";
import { criarAdaptadorAsaas, type AdaptadorAsaas } from "./adaptador-asaas";
import { criarAdaptadorInter } from "./adaptador-inter";
import type { ProvedorPagamento } from "./tipos";

export async function provedorDaEmpresa(
  empresaId: string,
  injetado?: ClienteHttpAsaas,
  interInjetado?: ClienteHttpInter,
): Promise<ProvedorPagamento> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { provedorPagamento: true },
  });
  const codigo = provedorCodigo(empresa?.provedorPagamento);
  if (!provedorEstaDisponivel(codigo)) {
    throw new ErroAplicacao(
      "Este provedor de pagamento ainda não está disponível. A empresa continua no Asaas.",
      422,
      "provedor_indisponivel",
    );
  }
  if (codigo === "INTER") return criarAdaptadorInter(await abrirClienteInter(empresaId, interInjetado));
  if (codigo !== "ASAAS") {
    throw new ErroAplicacao(
      "Este provedor de pagamento ainda não está disponível. A empresa continua no Asaas.",
      422,
      "provedor_indisponivel",
    );
  }
  const { http } = await abrirClienteAsaas(empresaId, injetado);
  return criarAdaptadorAsaas(http);
}

export async function clienteAsaasDaEmpresa(empresaId: string, injetado?: ClienteHttpAsaas): Promise<ClienteHttpAsaas> {
  const provedor = await provedorDaEmpresa(empresaId, injetado);
  if (!temClienteAsaas(provedor)) {
    throw new ErroAplicacao(
      "Este provedor de pagamento ainda não está disponível. A empresa continua no Asaas.",
      422,
      "provedor_indisponivel",
    );
  }
  return provedor.asaas;
}

function temClienteAsaas(provedor: ProvedorPagamento): provedor is AdaptadorAsaas {
  return provedor.provedor === "ASAAS" && "asaas" in provedor;
}
