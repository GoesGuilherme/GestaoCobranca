import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { conectarTwilio } from "@/server/services/twilio-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "twilio-conectar", 8, 10 * 60 * 1000);
    return jsonOk(await conectarTwilio(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
