import { exigirAcesso, exigirSuperadmin } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
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
    await consumirLimiteUsuario(acesso.usuarioId, "admin-empresa", 8, 60 * 60 * 1000);
    const empresa = await cadastrarEmpresaPeloAdmin(await lerJson(request));
    return jsonOk({ empresa }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
