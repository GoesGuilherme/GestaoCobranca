import { jsonErro, jsonOk } from "@/server/http";
import { processarWebhookTwilio } from "@/server/services/twilio-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bruto = await request.text();
  const parametros: Record<string, string> = {};
  new URLSearchParams(bruto).forEach((valor, chave) => {
    parametros[chave] = valor;
  });
  try {
    const resultado = await processarWebhookTwilio({
      assinatura: request.headers.get("x-twilio-signature"),
      parametros,
    });
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
