import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarFilial, excluirFilial, obterFilial } from "@/server/services/filial-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({ filial: await obterFilial(acesso.empresaId, id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const filial = await atualizarFilial(acesso.empresaId, id, await lerJson(request));
    return jsonOk({ filial });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    await excluirFilial(acesso.empresaId, id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
