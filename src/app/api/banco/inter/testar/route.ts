import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { testarConexaoInter } from "@/server/services/inter-config-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "inter-testar", 12, 10 * 60 * 1000);
    return jsonOk(await testarConexaoInter(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
