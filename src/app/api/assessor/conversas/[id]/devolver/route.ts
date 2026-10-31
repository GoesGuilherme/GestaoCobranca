import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { devolverConversa } from "@/server/services/assessor-service";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk(await devolverConversa(acesso, id));
  } catch (erro) {
    return jsonErro(erro);
  }
}
