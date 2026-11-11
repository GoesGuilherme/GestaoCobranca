import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { criarSubcontaTwilio } from "@/server/services/twilio-empresa-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    return jsonOk({ painel: await criarSubcontaTwilio(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
