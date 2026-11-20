import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { darBaixaManual } from "@/server/services/baixa-manual";

export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const resultado = await darBaixaManual(acesso, id, await lerJson(request));
    return jsonOk({ fatura: resultado.fatura, aviso: resultado.aviso });
  } catch (erro) {
    return jsonErro(erro);
  }
}
