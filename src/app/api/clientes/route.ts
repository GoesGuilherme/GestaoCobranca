import { criarCliente, listarClientes } from "@/server/services/cliente-service";
import { jsonErro, jsonOk, lerJson } from "@/server/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const clientes = await listarClientes({
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
    const cliente = await criarCliente(await lerJson(request));
    return jsonOk({ cliente }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
