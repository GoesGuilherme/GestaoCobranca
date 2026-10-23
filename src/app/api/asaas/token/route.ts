import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { regenerarTokenWebhookAsaas } from "@/server/services/asaas-config-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ configuracao: await regenerarTokenWebhookAsaas(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
