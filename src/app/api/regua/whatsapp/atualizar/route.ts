import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { atualizarTwilio } from "@/server/services/twilio-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "twilio-status", 30, 10 * 60 * 1000);
    return jsonOk(await atualizarTwilio(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
