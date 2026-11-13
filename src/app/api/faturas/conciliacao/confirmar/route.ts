import { esquemaConfirmarOfx } from "@/lib/validacao";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { confirmarSugestaoOfx } from "@/server/services/ofx-conciliacao";
import { lerEsquema } from "@/server/validar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const dados = lerEsquema(esquemaConfirmarOfx, await lerJson(request));
    await confirmarSugestaoOfx(acesso, dados.transacaoId, dados.faturaId);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
