import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarCorpoTemplateWhatsapp } from "@/server/services/twilio-empresa-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ painel: await salvarCorpoTemplateWhatsapp(acesso, await lerJson(request)) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
