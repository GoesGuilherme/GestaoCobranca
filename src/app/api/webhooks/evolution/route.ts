import { ErroAplicacao } from "@/server/erros";
import { ipDaRequisicao, jsonErro, jsonOk } from "@/server/http";
import { processarWebhookEvolution } from "@/server/services/evolution-webhook-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const texto = await request.text();
    if (texto.length > 100_000) {
      throw new ErroAplicacao("Evento inválido.", 413, "evolution_invalido");
    }
    let corpo: unknown = {};
    if (texto.trim()) {
      try {
        corpo = JSON.parse(texto) as unknown;
      } catch {
        throw new ErroAplicacao("Evento inválido.", 400, "evolution_invalido");
      }
    }
    const resultado = await processarWebhookEvolution({
      segredo: request.headers.get("apikey"),
      corpo,
      ip: ipDaRequisicao(request),
    });
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
