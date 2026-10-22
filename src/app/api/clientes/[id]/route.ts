import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarCliente, excluirCliente, obterCliente } from "@/server/services/cliente-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({ cliente: await obterCliente(acesso.empresaId, id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const cliente = await atualizarCliente(acesso.empresaId, id, await lerJson(request));
    return jsonOk({ cliente });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    await excluirCliente(acesso.empresaId, id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
