import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarRegua } from "@/server/services/regua-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await criarRegua(acesso, await lerJson(request)), 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
