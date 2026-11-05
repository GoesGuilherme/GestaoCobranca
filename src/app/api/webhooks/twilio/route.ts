import { ErroAplicacao } from "@/server/erros";
import { ipDaRequisicao, jsonErro, jsonOk } from "@/server/http";
import { falhasWebhookEstouradas, registrarFalhaWebhook } from "@/server/seguranca/limite";
import { processarWebhookTwilio } from "@/server/services/twilio-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bruto = await request.text();
  const parametros: Record<string, string> = {};
  new URLSearchParams(bruto).forEach((valor, chave) => {
    parametros[chave] = valor;
  });
  const ip = ipDaRequisicao(request);
  try {
    const resultado = await processarWebhookTwilio({
      assinatura: request.headers.get("x-twilio-signature"),
      parametros,
    });
    return jsonOk(resultado);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 403) {
      if (await falhasWebhookEstouradas("twilio", ip)) {
        return jsonErro(new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_tentativas"));
      }
      await registrarFalhaWebhook("twilio", ip);
    }
    return jsonErro(erro);
  }
}
