import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import {
  atualizarServicoDoCliente,
  excluirServicoDoCliente,
} from "@/server/services/cliente-servico-service";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await atualizarServicoDoCliente(acesso, id, await lerJson(request));
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    await excluirServicoDoCliente(acesso, id);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
