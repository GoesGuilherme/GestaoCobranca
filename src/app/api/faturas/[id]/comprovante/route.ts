import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { comprovantePendenteDaFatura } from "@/server/services/comprovante-service";

export const runtime = "nodejs";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const comprovante = await comprovantePendenteDaFatura(acesso, id);
    return jsonOk({ comprovante });
  } catch (erro) {
    return jsonErro(erro);
  }
}
