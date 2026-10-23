import { podeVerCustoServico } from "@/lib/permissoes";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarServico, excluirServico, obterServico } from "@/server/services/servico-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({
      servico: await obterServico(acesso.empresaId, id, podeVerCustoServico(acesso.papel)),
    });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await atualizarServico(acesso, id, await lerJson(request));
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    await excluirServico(acesso, id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
