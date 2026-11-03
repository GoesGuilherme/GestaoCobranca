import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { aplicarEventoDeProvedor } from "./aplicar-evento";
import { provedorConhecido } from "./contrato";
import { provedorDaEmpresa, provedorEscolhido } from "./fabrica";

/**
 * URL por empresa: /api/webhooks/pagamento/{provedor}/{segredo}.
 * O Asaas não usa esta rota. O segredo é o mesmo tipo de hash do token atual.
 * Provedor sem conector recusa antes de gravar baixa. Quando o conector existir,
 * a baixa passa por confirmarEventoAntesDaBaixa.
 */
export async function processarWebhookProvedor(
  codigo: string,
  segredo: string,
  entrada: { headers: Headers; corpo: unknown },
) {
  const provedorCodigo = codigo.trim().toUpperCase();
  if (provedorCodigo === "ASAAS") {
    throw new ErroAplicacao("O webhook do Asaas continua em /api/webhooks/asaas.", 404, "webhook_asaas");
  }
  if (!provedorConhecido(provedorCodigo)) {
    throw new ErroAplicacao("Provedor de pagamento desconhecido.", 404, "provedor_desconhecido");
  }
  const recebido = segredo.trim();
  if (!recebido) throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");

  const config = await prisma.configuracaoPagamento.findUnique({
    where: { segredoWebhookHash: hashTokenWebhook(recebido) },
  });
  if (!config || config.provedor !== provedorCodigo || !tokensWebhookIguais(recebido, config.segredoWebhookHash ?? "")) {
    throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");
  }

  const escolhido = await provedorEscolhido(config.empresaId);
  if (escolhido !== provedorCodigo) {
    throw new ErroAplicacao("O provedor da empresa não é o desta URL.", 409, "provedor_divergente");
  }
  const { provedor } = await provedorDaEmpresa(config.empresaId);
  const eventos = await provedor.normalizarWebhook(entrada);
  const resultados = [];
  for (const evento of eventos) {
    resultados.push(await aplicarEventoDeProvedor(config.empresaId, provedor, evento));
  }
  return { recebido: true as const, resultados };
}
