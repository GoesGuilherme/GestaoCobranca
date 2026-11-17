import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import { abrirClienteAsaas } from "@/server/asaas/abrir";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { abrirClienteCora } from "@/server/cora/abrir";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { abrirClienteInter } from "@/server/inter/abrir";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { provedorCodigo } from "@/lib/status-pagamento";
import { provedorEstaDisponivel } from "./capacidades";
import { criarAdaptadorAsaas, type AdaptadorAsaas } from "./adaptador-asaas";
import { criarAdaptadorCora } from "./adaptador-cora";
import { criarAdaptadorInter } from "./adaptador-inter";
import type { ProvedorPagamento } from "./tipos";

const PROVEDOR_INDISPONIVEL = "Este provedor de pagamento ainda não está disponível.";

export async function provedorDaEmpresa(
  empresaId: string,
  injetado?: ClienteHttpAsaas,
  interInjetado?: ClienteHttpInter,
  coraInjetado?: ClienteHttpCora,
): Promise<ProvedorPagamento> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { provedorPagamento: true },
  });
  const codigo = provedorCodigo(empresa?.provedorPagamento);
  if (!provedorEstaDisponivel(codigo)) {
    throw new ErroAplicacao(PROVEDOR_INDISPONIVEL, 422, "provedor_indisponivel");
  }
  if (codigo === "INTER") return criarAdaptadorInter(await abrirClienteInter(empresaId, interInjetado));
  if (codigo === "CORA") return criarAdaptadorCora(await abrirClienteCora(empresaId, coraInjetado));
  if (codigo !== "ASAAS") {
    throw new ErroAplicacao(PROVEDOR_INDISPONIVEL, 422, "provedor_indisponivel");
  }
  const { http } = await abrirClienteAsaas(empresaId, injetado);
  return criarAdaptadorAsaas(http);
}

export async function clienteAsaasDaEmpresa(empresaId: string, injetado?: ClienteHttpAsaas): Promise<ClienteHttpAsaas> {
  const provedor = await provedorDaEmpresa(empresaId, injetado);
  if (!temClienteAsaas(provedor)) {
    throw new ErroAplicacao("A empresa não está no Asaas.", 422, "provedor_indisponivel");
  }
  return provedor.asaas;
}

// Cobrança ou assinatura que já nasceu no Asaas. Não olha o provedor atual da empresa:
// a chave continua em configuracoes_asaas mesmo depois de trocar para Pix, Cora ou Inter.
export async function httpAsaasDaCobranca(
  empresaId: string,
  injetado?: ClienteHttpAsaas,
  assunto: "fatura" | "assinatura" = "fatura",
): Promise<ClienteHttpAsaas> {
  try {
    return (await abrirClienteAsaas(empresaId, injetado)).http;
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.codigo === "asaas_nao_configurado") {
      const texto =
        assunto === "assinatura"
          ? "Esta assinatura é do Asaas, mas a empresa não tem o Asaas configurado."
          : "Esta fatura é do Asaas, mas a empresa não tem o Asaas configurado.";
      throw new ErroAplicacao(texto, erro.status, erro.codigo);
    }
    throw erro;
  }
}

function temClienteAsaas(provedor: ProvedorPagamento): provedor is AdaptadorAsaas {
  return provedor.provedor === "ASAAS" && "asaas" in provedor;
}
