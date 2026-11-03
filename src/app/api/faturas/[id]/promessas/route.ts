import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { registrarPromessa } from "@/server/services/promessa-service";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const promessa = await registrarPromessa(acesso, id, await lerJson(request));
    return jsonOk({ promessa }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
