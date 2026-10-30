import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { confirmarCodigoTwilio } from "@/server/services/twilio-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await confirmarCodigoTwilio(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
