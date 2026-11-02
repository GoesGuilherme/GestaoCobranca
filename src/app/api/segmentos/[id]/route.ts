import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarSegmento, excluirSegmento, obterSegmento } from "@/server/services/segmento-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({ segmento: await obterSegmento(acesso.empresaId, id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const segmento = await atualizarSegmento(acesso, id, await lerJson(request));
    return jsonOk({ segmento });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    await excluirSegmento(acesso, id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
