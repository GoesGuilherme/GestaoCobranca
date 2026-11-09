const TIPOS = new Set(["invoice.paid", "invoice.canceled", "invoice.cancelled", "invoice.overdue", "invoice.created", "invoice.drafted"]);

export type AvisoCora = {
  idEvento: string;
  tipo: string;
  idExterno: string;
};

function cabecalho(headers: Headers, nome: string): string {
  return (headers.get(nome) ?? "").trim();
}

export function agenteWebhookCora(headers: Headers): boolean {
  const agente = cabecalho(headers, "user-agent");
  return agente === "Cora-Webhook" || agente.startsWith("Cora-Webhook ") || agente.startsWith("Cora-Webhook/");
}

export function lerAvisoCora(headers: Headers): AvisoCora | null {
  const idEvento = cabecalho(headers, "webhook-event-id");
  const tipo = cabecalho(headers, "webhook-event-type").toLowerCase();
  const idExterno = cabecalho(headers, "webhook-resource-id");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(idEvento)) return null;
  if (!TIPOS.has(tipo)) return null;
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(idExterno)) return null;
  return { idEvento, tipo, idExterno };
}
