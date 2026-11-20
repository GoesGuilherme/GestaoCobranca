import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro } from "@/server/http";
import { lerMidiaComprovante } from "@/server/services/comprovante-service";

export const runtime = "nodejs";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const midia = await lerMidiaComprovante(acesso, id);
    return new Response(Buffer.from(midia.bytes), {
      headers: {
        "content-type": midia.mime,
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erro) {
    return jsonErro(erro);
  }
}
