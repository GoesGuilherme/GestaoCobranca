import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarConfiguracaoRegua } from "@/server/services/regua-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await salvarConfiguracaoRegua(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
