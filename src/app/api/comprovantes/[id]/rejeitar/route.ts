import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { rejeitarComprovante } from "@/server/services/comprovante-service";

export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const corpo = await lerJson(request);
    const motivo = corpo && typeof corpo === "object" && "motivo" in corpo && typeof corpo.motivo === "string" ? corpo.motivo : "";
    await rejeitarComprovante(acesso, id, motivo);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
