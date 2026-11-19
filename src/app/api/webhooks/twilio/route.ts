import { after } from "next/server";
import { jsonErro, jsonOk } from "@/server/http";
import { executarAtendimentoIa } from "@/server/services/atendimento-ia-service";
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
      agendarAtendimentoIa: (trabalho) => {
        after(async () => {
          try {
            await executarAtendimentoIa(trabalho);
          } catch (erro) {
            console.error("atendimento_ia", erro instanceof Error ? erro.name : "falha");
          }
        });
      },
    });
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
