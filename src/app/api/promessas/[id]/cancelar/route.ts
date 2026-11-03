import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { cancelarPromessa } from "@/server/services/promessa-service";

export async function POST(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const promessa = await cancelarPromessa(acesso, id);
    return jsonOk({ promessa });
  } catch (erro) {
    return jsonErro(erro);
  }
}
