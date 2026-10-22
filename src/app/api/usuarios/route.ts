import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarUsuarioDaEmpresa, listarUsuarios } from "@/server/services/usuario-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ usuarios: await listarUsuarios(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const usuario = await criarUsuarioDaEmpresa(acesso, await lerJson(request));
    return jsonOk({ usuario }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
