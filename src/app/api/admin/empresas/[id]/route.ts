import { exigirAcesso, exigirSuperadmin } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { alterarStatusEmpresa } from "@/server/services/empresa-service";
import { esquemaStatusEmpresa } from "@/lib/validacao";
import { lerEsquema } from "@/server/validar";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    exigirSuperadmin(acesso);
    const { id } = await contexto.params;
    const dados = lerEsquema(esquemaStatusEmpresa, await lerJson(request));
    const empresa = await alterarStatusEmpresa(acesso, id, dados.status);
    return jsonOk({ empresa });
  } catch (erro) {
    return jsonErro(erro);
  }
}
