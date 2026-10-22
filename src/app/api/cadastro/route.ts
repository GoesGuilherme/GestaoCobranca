import { cadastrarEmpresaPublica } from "@/server/services/empresa-service";
import { ipDaRequisicao, jsonErro, jsonOk, lerJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    const empresa = await cadastrarEmpresaPublica(await lerJson(request), ipDaRequisicao(request));
    return jsonOk({ empresa }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
