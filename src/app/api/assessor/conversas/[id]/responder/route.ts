import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { responderConversa } from "@/server/services/assessor-service";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk(await responderConversa(acesso, id, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}