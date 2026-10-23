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

export function traduzirErroAsaas(erro: unknown): never {
  if (erro instanceof ErroAplicacao) throw erro;
  if (erro instanceof ErroAsaas) {
    if (erro.status === 401) {
      throw new ErroAplicacao(erro.message, 400, "asaas_nao_autorizado");
    }
    const status = erro.status >= 400 && erro.status < 500 && erro.status !== 401 ? erro.status : 502;
    throw new ErroAplicacao(erro.message, status, "asaas");
  }
  throw erro;
}
