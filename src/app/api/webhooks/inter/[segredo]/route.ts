import { NextResponse } from "next/server";
import { jsonErro, lerJson } from "@/server/http";
import { processarWebhookInter } from "@/server/services/inter-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, contexto: { params: Promise<{ segredo: string }> }) {
  try {
    const { segredo } = await contexto.params;
    await processarWebhookInter(segredo, await lerJson(request));
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
