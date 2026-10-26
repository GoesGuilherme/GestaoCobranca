import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { enviarEmailTesteRegua } from "@/server/services/regua-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await enviarEmailTesteRegua(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
