import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { retomarRecorrencia } from "@/server/services/recorrencia-service";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await retomarRecorrencia(acesso, id, await lerJson(request));
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}
