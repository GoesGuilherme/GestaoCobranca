import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { editarPromessa } from "@/server/services/promessa-service";

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const promessa = await editarPromessa(acesso, id, await lerJson(request));
    return jsonOk({ promessa });
  } catch (erro) {
    return jsonErro(erro);
  }
}
