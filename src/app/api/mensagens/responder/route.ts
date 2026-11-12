import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { responderWhatsapp } from "@/server/services/mensagens-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O texto só sai quando esta rota recebe o clique em Enviar resposta.
export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await responderWhatsapp(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
