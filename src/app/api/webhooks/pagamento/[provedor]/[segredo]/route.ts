import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { processarWebhookProvedor } from "@/server/pagamentos/webhook";

type Contexto = { params: Promise<{ provedor: string; segredo: string }> };

export async function POST(request: Request, contexto: Contexto) {
  try {
    const { provedor, segredo } = await contexto.params;
    const resultado = await processarWebhookProvedor(provedor, segredo, {
      headers: request.headers,
      corpo: await lerJson(request),
    });
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
