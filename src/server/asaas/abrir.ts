import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { clienteAsaasDaConfig } from "./fabrica";
import { type ClienteHttpAsaas, ErroAsaas } from "./contrato";

export async function abrirClienteAsaas(empresaId: string, injetado?: ClienteHttpAsaas) {
  const config = await prisma.configuracaoAsaas.findUnique({ where: { empresaId } });
  if (!config) {
    throw new ErroAplicacao(
      "Configure o Asaas desta empresa antes de continuar.",
      409,
      "asaas_nao_configurado",
    );
  }
  if (injetado) return { config, http: injetado };
  const apiKey = decifrarSegredoAsaas(config.chaveApiCifrada);
  return {
    config,
    http: clienteAsaasDaConfig({ ambiente: config.ambiente, apiKey }),
  };
}

function comoErroAsaas(erro: unknown): ErroAsaas | null {
  if (erro instanceof ErroAsaas) return erro;
  if (erro instanceof Error && erro.name === "ErroAsaas" && "status" in erro && typeof erro.status === "number") {
    return erro as ErroAsaas;
  }
  return null;
}

export function asaasRespondeu(erro: unknown, status: number): boolean {
  return comoErroAsaas(erro)?.status === status;
}

export function traduzirErroAsaas(erro: unknown): never {
  if (erro instanceof ErroAplicacao) throw erro;
  const asaas = comoErroAsaas(erro);
  if (asaas) {
    if (asaas.status === 401) {
      throw new ErroAplicacao(asaas.message, 400, "asaas_nao_autorizado");
    }
    const status = asaas.status >= 400 && asaas.status < 500 && asaas.status !== 401 ? asaas.status : 502;
    throw new ErroAplicacao(asaas.message, status, "asaas");
  }
  throw erro;
}
