import { NextResponse } from "next/server";
import { ipDaRequisicao, jsonErro } from "@/server/http";
import { processarWebhookCora } from "@/server/services/cora-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, contexto: { params: Promise<{ segredo: string }> }) {
  try {
    const { segredo } = await contexto.params;
    await request.text();
    const proto = request.headers.get("x-forwarded-proto");
    if (process.env.NODE_ENV === "production" && proto && proto !== "https") {
      return NextResponse.json({ erro: "Webhook recusado." }, { status: 401 });
    }
    await processarWebhookCora(segredo, request.headers, { ip: ipDaRequisicao(request) });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return jsonErro(erro);
  }
}
