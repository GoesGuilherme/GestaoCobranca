import { NextResponse } from "next/server";
import { ErroAplicacao } from "@/server/erros";
import { ipDaRequisicao, jsonErro, lerJson } from "@/server/http";
import { falhasWebhookEstouradas, registrarFalhaWebhook } from "@/server/seguranca/limite";
import { processarWebhookInter } from "@/server/services/inter-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, contexto: { params: Promise<{ segredo: string }> }) {
  const ip = ipDaRequisicao(request);
  try {
    const { segredo } = await contexto.params;
    await processarWebhookInter(segredo, await lerJson(request));
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 401) {
      if (await falhasWebhookEstouradas("inter", ip)) {
        return jsonErro(new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_tentativas"));
      }
      await registrarFalhaWebhook("inter", ip);
    }
    return jsonErro(erro);
  }
}
