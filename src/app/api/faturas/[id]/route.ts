import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { alterarFatura } from "@/server/services/alteracao-fatura-service";
import { cancelarFatura } from "@/server/services/fatura-service";

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const resultado = await alterarFatura(acesso, id, await lerJson(request));
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const fatura = await cancelarFatura(acesso, id);
    return jsonOk({ fatura });
  } catch (erro) {
    return jsonErro(erro);
  }
}
