import { ErroAplicacao } from "@/server/erros";
import { evolutionWhatsappHabilitada } from "@/server/whatsapp/selecao";
import type { ClienteEvolution } from "./contrato";
import { criarClienteEvolutionHttp, urlEvolutionConfiavel } from "./http";

type Ambiente = {
  NODE_ENV?: string;
  EVOLUTION_WHATSAPP_ENABLED?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_WEBHOOK_SECRET?: string;
  EVOLUTION_WEBHOOK_URL?: string;
};

export function evolutionLigada(env: Ambiente = process.env): boolean {
  return evolutionWhatsappHabilitada(env);
}

export function segredoWebhookEvolution(env: Ambiente = process.env): string {
  const segredo = env.EVOLUTION_WEBHOOK_SECRET?.trim() ?? "";
  if (segredo.length < 24) {
    throw new ErroAplicacao(
      "Defina EVOLUTION_WEBHOOK_SECRET no servidor. Ele não aparece na tela.",
      500,
      "evolution_sem_webhook",
    );
  }
  return segredo;
}

export function urlWebhookEvolution(env: Ambiente = process.env): string {
  const bruto = env.EVOLUTION_WEBHOOK_URL?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new ErroAplicacao(
      "Defina EVOLUTION_WEBHOOK_URL com o endereço público de /api/webhooks/evolution.",
      500,
      "evolution_sem_webhook",
    );
  }
  if (url.pathname !== "/api/webhooks/evolution" || url.username || url.password || url.search) {
    throw new ErroAplicacao("EVOLUTION_WEBHOOK_URL precisa terminar em /api/webhooks/evolution.", 500, "evolution_sem_webhook");
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new ErroAplicacao("Em produção o webhook da Evolution precisa ser https.", 500, "evolution_sem_webhook");
  }
  return bruto;
}

export function clienteEvolutionPadrao(env: Ambiente = process.env): ClienteEvolution | null {
  if (env.NODE_ENV === "test" || !evolutionLigada(env)) return null;
  const url = env.EVOLUTION_API_URL?.trim() ?? "";
  const chave = env.EVOLUTION_API_KEY?.trim() ?? "";
  if (!url || chave.length < 16) return null;
  urlEvolutionConfiavel(url, env);
  return criarClienteEvolutionHttp({ env });
}
