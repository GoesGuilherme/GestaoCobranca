import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { definirFormaPadrao } from "@/server/services/formas-cobranca-service";
import { lerEsquema } from "@/server/validar";
import { esquemaFormaPadrao } from "@/lib/validacao";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const dados = lerEsquema(esquemaFormaPadrao, await lerJson(request));
    const formas = await definirFormaPadrao(acesso, dados.opcaoId);
    return jsonOk({ formas });
  } catch (erro) {
    return jsonErro(erro);
  }
}
