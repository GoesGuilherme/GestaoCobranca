import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { testarConexaoAsaas } from "@/server/services/asaas-config-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "asaas-testar", 12, 10 * 60 * 1000);
    return jsonOk(await testarConexaoAsaas(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
