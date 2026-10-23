import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { processarWebhookAsaas } from "@/server/services/asaas-webhook-service";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("asaas-access-token");
    const resultado = await processarWebhookAsaas(token, await lerJson(request));
    return jsonOk({ recebido: true, duplicado: resultado.duplicado });
  } catch (erro) {
    return jsonErro(erro);
  }
}
