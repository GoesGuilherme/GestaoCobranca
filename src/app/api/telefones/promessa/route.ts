import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarPromessaWhatsapp } from "@/server/services/twilio-empresa-service";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ painel: await salvarPromessaWhatsapp(acesso, await lerJson(request)) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
