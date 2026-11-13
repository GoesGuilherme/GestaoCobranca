import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { marcarFaturaPixPaga } from "@/server/services/pix-cobranca";

export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const fatura = await marcarFaturaPixPaga(acesso, id, await lerJson(request));
    return jsonOk({ fatura });
  } catch (erro) {
    return jsonErro(erro);
  }
}
