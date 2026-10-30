import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { atualizarTwilio } from "@/server/services/twilio-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await atualizarTwilio(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
