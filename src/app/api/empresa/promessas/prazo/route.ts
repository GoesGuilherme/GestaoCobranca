import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarPrazoPromessa } from "@/server/services/promessa-service";

export async function PATCH(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const ajuste = await salvarPrazoPromessa(acesso, await lerJson(request));
    return jsonOk({ ajuste });
  } catch (erro) {
    return jsonErro(erro);
  }
}
