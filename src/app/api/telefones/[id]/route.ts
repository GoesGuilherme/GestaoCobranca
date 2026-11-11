import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { atualizarNumeroTwilio, removerNumeroTwilio } from "@/server/services/twilio-empresa-service";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    const { id } = await contexto.params;
    return jsonOk({ painel: await atualizarNumeroTwilio(acesso, id, await lerJson(request)) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    const { id } = await contexto.params;
    return jsonOk({ painel: await removerNumeroTwilio(acesso, id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
