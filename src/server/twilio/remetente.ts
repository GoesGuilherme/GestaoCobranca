import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import {
  canalTwilio,
  remetenteDoCanal,
  type CanalTwilioEmpresa,
} from "@/lib/twilio-empresa";
import { prisma } from "@/server/db";
import type { CredencialTwilio } from "@/server/twilio/contrato";
import { urlWebhookTwilio } from "@/server/twilio/fabrica";

const SID_CONTA = /^AC[0-9a-fA-F]{32}$/;

export type RemetenteEmpresa = {
  origem: "empresa";
  canal: CanalTwilioEmpresa;
  conta: CredencialTwilio;
  de: string;
  telefoneE164: string;
  statusCallback: string;
};

// Subconta configurada e número padrão ativo. Sem isso, devolve null e o
// chamador segue com a conta e o número globais que já montou.
export async function remetenteDaEmpresa(
  empresaId: string,
  canal: CanalTwilioEmpresa,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RemetenteEmpresa | null> {
  const [subconta, numero] = await Promise.all([
    prisma.subcontaTwilio.findUnique({ where: { empresaId } }),
    prisma.numeroTwilioEmpresa.findFirst({
      where: { empresaId, canal, padrao: true, status: "ATIVO" },
    }),
  ]);
  if (!subconta || subconta.status !== "CONFIGURADA" || !numero) return null;
  if (!SID_CONTA.test(subconta.subaccountSid) || !canalTwilio(numero.canal)) return null;
  let authToken = "";
  try {
    authToken = decifrarSegredoAsaas(subconta.credencialCifrada);
  } catch {
    return null;
  }
  if (authToken.length < 16) return null;
  let statusCallback = "";
  try {
    statusCallback = urlWebhookTwilio(env);
  } catch {
    return null;
  }
  return {
    origem: "empresa",
    canal,
    conta: { accountSid: subconta.subaccountSid, authToken },
    de: remetenteDoCanal(canal, numero.telefoneE164),
    telefoneE164: numero.telefoneE164,
    statusCallback,
  };
}

export async function aplicarRemetenteEmpresa<T extends { conta: CredencialTwilio; de: string; statusCallback: string }>(
  empresaId: string,
  canal: CanalTwilioEmpresa,
  atual: T,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T & { origem: "empresa" | "global" }> {
  const empresa = await remetenteDaEmpresa(empresaId, canal, env);
  if (!empresa) return { ...atual, origem: "global" };
  return {
    ...atual,
    conta: empresa.conta,
    de: empresa.de,
    statusCallback: empresa.statusCallback,
    origem: "empresa",
  };
}
