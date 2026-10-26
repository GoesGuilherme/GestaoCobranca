import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { obterPainelRegua } from "@/server/services/regua-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await obterPainelRegua(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
