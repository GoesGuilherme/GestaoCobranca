import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { pausarRecorrencia } from "@/server/services/recorrencia-service";

export async function POST(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await pausarRecorrencia(acesso, id);
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}
