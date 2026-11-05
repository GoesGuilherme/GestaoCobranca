import { ErroAplicacao } from "@/server/erros";
import { ipDaRequisicao, jsonErro, jsonOk, lerJson } from "@/server/http";
import { falhasWebhookEstouradas, registrarFalhaWebhook } from "@/server/seguranca/limite";
import { processarWebhookAsaas } from "@/server/services/asaas-webhook-service";

export async function POST(request: Request) {
  const ip = ipDaRequisicao(request);
  try {
    const token = request.headers.get("asaas-access-token");
    const resultado = await processarWebhookAsaas(token, await lerJson(request));
    return jsonOk({ recebido: true, duplicado: resultado.duplicado });
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 401) {
      if (await falhasWebhookEstouradas("asaas", ip)) {
        return jsonErro(new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_tentativas"));
      }
      await registrarFalhaWebhook("asaas", ip);
    }
    return jsonErro(erro);
  }
}
