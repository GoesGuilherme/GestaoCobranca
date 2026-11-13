import { esquemaIgnorarOfx } from "@/lib/validacao";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { ignorarSugestaoOfx } from "@/server/services/ofx-conciliacao";
import { lerEsquema } from "@/server/validar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const dados = lerEsquema(esquemaIgnorarOfx, await lerJson(request));
    await ignorarSugestaoOfx(acesso, dados.transacaoId);
    return jsonOk({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
