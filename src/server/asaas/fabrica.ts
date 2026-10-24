import { randomBytes } from "node:crypto";
import { ErroAplicacao } from "@/server/erros";
import { criarClienteHttpAsaas } from "./cliente-http";
import { type AmbienteAsaas, type ClienteHttpAsaas, URL_ASAAS } from "./contrato";
import { AsaasMemoria } from "./memoria";

type AmbienteProcesso = {
  ASAAS_MOCK?: string;
  NODE_ENV?: string;
};

export function mockAsaasLigado(env: AmbienteProcesso = process.env): boolean {
  return env.ASAAS_MOCK === "true" && env.NODE_ENV !== "production";
}

export function afirmarMockAsaasPermitido(env: AmbienteProcesso = process.env) {
  if (env.ASAAS_MOCK === "true" && env.NODE_ENV === "production") {
    throw new ErroAplicacao(
      "ASAAS_MOCK não pode ficar ligado em produção.",
      500,
      "asaas_mock_proibido",
    );
  }
}

const memoriaGlobal = globalThis as unknown as { asaasMemoriaDev?: AsaasMemoria };

export function memoriaAsaasDev(): AsaasMemoria {
  if (!memoriaGlobal.asaasMemoriaDev) {
    memoriaGlobal.asaasMemoriaDev = new AsaasMemoria(`dev${randomBytes(3).toString("hex")}`);
  }
  return memoriaGlobal.asaasMemoriaDev;
}

export function clienteAsaasDaConfig(dados: { ambiente: AmbienteAsaas; apiKey: string }): ClienteHttpAsaas {
  afirmarMockAsaasPermitido();
  if (mockAsaasLigado()) return memoriaAsaasDev();
  return criarClienteHttpAsaas({ baseUrl: URL_ASAAS[dados.ambiente], apiKey: dados.apiKey });
}
