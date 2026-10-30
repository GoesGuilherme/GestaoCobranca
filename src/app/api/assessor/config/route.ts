import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarAssessor } from "@/server/services/assessor-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await salvarAssessor(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
