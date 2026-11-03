export function origemPublica(informada?: string | null): string | null {
  const configurada = process.env.PAGAMENTOS_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  if (configurada.startsWith("https://")) return configurada;
  const pedido = informada?.trim().replace(/\/$/, "") ?? "";
  if (pedido.startsWith("https://")) return pedido;
  return null;
}

export function urlPdfFatura(faturaId: string): string {
  const caminho = `/api/faturas/${faturaId}/pdf`;
  const base = origemPublica();
  return base ? `${base}${caminho}` : caminho;
}

export function urlWebhookInter(segredo: string, origem?: string | null): string | null {
  const base = origemPublica(origem);
  if (!base) return null;
  return `${base}/api/webhooks/inter/${segredo}`;
}
