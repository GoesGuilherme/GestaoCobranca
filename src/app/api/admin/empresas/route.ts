import { exigirAcesso, exigirSuperadmin } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { cadastrarEmpresaPeloAdmin, listarEmpresas } from "@/server/services/empresa-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    exigirSuperadmin(acesso);
    return jsonOk({ empresas: await listarEmpresas() });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirSuperadmin(acesso);
    const empresa = await cadastrarEmpresaPeloAdmin(await lerJson(request));
    return jsonOk({ empresa }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
