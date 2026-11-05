import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { enviarEmailTesteRegua } from "@/server/services/regua-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "regua-teste-email", 5, 10 * 60 * 1000);
    return jsonOk(await enviarEmailTesteRegua(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
