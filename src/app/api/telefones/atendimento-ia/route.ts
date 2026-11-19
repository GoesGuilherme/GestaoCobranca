import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarAtendimentoIa } from "@/server/services/atendimento-ia-service";

export async function PATCH(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const atendimento = await salvarAtendimentoIa(acesso, await lerJson(request));
    return jsonOk({ atendimento });
  } catch (erro) {
    return jsonErro(erro);
  }
}
