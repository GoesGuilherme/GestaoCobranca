import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import {
  ativarRecorrencia,
  cancelarRecorrencia,
  editarRecorrencia,
} from "@/server/services/recorrencia-service";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await ativarRecorrencia(acesso, id, await lerJson(request));
    return jsonOk({ servico }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await editarRecorrencia(acesso, id, await lerJson(request));
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await cancelarRecorrencia(acesso, id);
    return jsonOk({ servico });
  } catch (erro) {
    return jsonErro(erro);
  }
}
