import { atualizarFilial, excluirFilial, obterFilial } from "@/server/services/filial-service";
import { jsonErro, jsonOk, lerJson } from "@/server/http";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    return jsonOk({ filial: await obterFilial(id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    const filial = await atualizarFilial(id, await lerJson(request));
    return jsonOk({ filial });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    await excluirFilial(id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
