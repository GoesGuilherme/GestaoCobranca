import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { cadastrarNumeroTwilio, obterPainelTelefones } from "@/server/services/twilio-empresa-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ painel: await obterPainelTelefones(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ painel: await cadastrarNumeroTwilio(acesso, await lerJson(request)) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
