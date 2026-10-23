import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { cancelarFatura } from "@/server/services/fatura-service";

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
