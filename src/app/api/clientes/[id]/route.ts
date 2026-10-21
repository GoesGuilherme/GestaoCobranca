import { atualizarCliente, excluirCliente, obterCliente } from "@/server/services/cliente-service";
import { jsonErro, jsonOk, lerJson } from "@/server/http";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    return jsonOk({ cliente: await obterCliente(id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    const cliente = await atualizarCliente(id, await lerJson(request));
    return jsonOk({ cliente });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    await excluirCliente(id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
