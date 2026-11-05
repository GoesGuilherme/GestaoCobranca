import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { regenerarTokenWebhookAsaas } from "@/server/services/asaas-config-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "asaas-token", 5, 60 * 60 * 1000);
    return jsonOk({ configuracao: await regenerarTokenWebhookAsaas(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
