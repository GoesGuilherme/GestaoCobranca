import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atribuirReguaCliente } from "@/server/services/regua-service";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const atribuicao = await atribuirReguaCliente(acesso, id, await lerJson(request));
    return jsonOk({ atribuicao });
  } catch (erro) {
    return jsonErro(erro);
  }
}
