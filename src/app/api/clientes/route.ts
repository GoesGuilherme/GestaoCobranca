import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarCliente, listarClientes } from "@/server/services/cliente-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const acesso = await exigirAcesso();
    const clientes = await listarClientes(acesso.empresaId, {
      q: url.searchParams.get("q") ?? undefined,
      segmento: url.searchParams.get("segmento") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return jsonOk({ clientes });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const cliente = await criarCliente(acesso.empresaId, await lerJson(request), acesso.papel);
    return jsonOk({ cliente }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
