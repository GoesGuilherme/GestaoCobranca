import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarEmpresa, obterEmpresa } from "@/server/services/empresa-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ empresa: await obterEmpresa(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    const empresa = await atualizarEmpresa(acesso, await lerJson(request));
    return jsonOk({ empresa });
  } catch (erro) {
    return jsonErro(erro);
  }
}
