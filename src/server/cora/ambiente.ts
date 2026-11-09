import { ErroAplicacao } from "@/server/erros";

export const URL_STAGE_CORA = "https://api.stage.cora.com.br";
export const URL_PRODUCAO_CORA = "https://api.cora.com.br";
export const REDIRECT_PADRAO_CORA = "https://gestao-cobranca-beta.vercel.app/api/integracoes/cora/callback";
export const ESCOPO_CORA = "invoice";

const HOSTS = new Set(["api.stage.cora.com.br", "api.cora.com.br"]);

export function producaoCoraLigada(): boolean {
  return process.env.CORA_AMBIENTE?.trim().toLowerCase() === "producao";
}

export function ambienteGravadoCora(): "SANDBOX" | "PRODUCAO" {
  return producaoCoraLigada() ? "PRODUCAO" : "SANDBOX";
}

// Stage é o padrão. A URL de produção só entra com CORA_AMBIENTE=producao.
// CORA_API_BASE apontando para api.cora.com.br sem essa flag é ignorada.
export function baseCora(): string {
  const explicita = process.env.CORA_API_BASE?.trim().replace(/\/+$/, "") ?? "";
  if (!producaoCoraLigada()) {
    if (!explicita || explicita === URL_STAGE_CORA) return URL_STAGE_CORA;
    try {
      const url = new URL(explicita);
      if (url.protocol === "https:" && url.hostname === "api.stage.cora.com.br" && (url.pathname === "/" || url.pathname === "")) {
        return URL_STAGE_CORA;
      }
    } catch {
      return URL_STAGE_CORA;
    }
    return URL_STAGE_CORA;
  }
  if (!explicita || explicita === URL_PRODUCAO_CORA) return URL_PRODUCAO_CORA;
  try {
    const url = new URL(explicita);
    if (url.protocol === "https:" && url.hostname === "api.stage.cora.com.br") return URL_STAGE_CORA;
  } catch {
    return URL_PRODUCAO_CORA;
  }
  return URL_PRODUCAO_CORA;
}

export function redirectCora(): string {
  const valor = process.env.CORA_REDIRECT_URI?.trim();
  if (!valor) return REDIRECT_PADRAO_CORA;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroAplicacao("CORA_REDIRECT_URI não é um endereço válido.", 500, "cora_config");
  }
  if (url.protocol !== "https:") {
    throw new ErroAplicacao("CORA_REDIRECT_URI precisa ser HTTPS.", 500, "cora_config");
  }
  return valor;
}

export function credenciaisParceiroCora(): { clientId: string; clientSecret: string } {
  const clientId = process.env.CORA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.CORA_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new ErroAplicacao(
      "A parceria Cora ainda não está configurada neste ambiente.",
      503,
      "cora_sem_parceiro",
    );
  }
  return { clientId, clientSecret };
}

export function parceiroCoraConfigurado(): boolean {
  return Boolean(process.env.CORA_CLIENT_ID?.trim() && process.env.CORA_CLIENT_SECRET?.trim());
}

export function segredoWebhookCora(): string | null {
  const segredo = process.env.CORA_WEBHOOK_SEGREDO?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(segredo)) return null;
  return segredo;
}

export function origemPublicaCora(): string | null {
  const publica = process.env.PAGAMENTOS_PUBLIC_URL?.trim().replace(/\/+$/, "") ?? "";
  if (publica.startsWith("https://")) return publica;
  try {
    return new URL(redirectCora()).origin;
  } catch {
    return null;
  }
}

export function urlWebhookCora(): string | null {
  const segredo = segredoWebhookCora();
  const origem = origemPublicaCora();
  if (!segredo || !origem) return null;
  return `${origem}/api/webhooks/cora/${segredo}`;
}

export function urlCoraPermitida(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!HOSTS.has(url.hostname)) return false;
  if (url.hostname === "api.cora.com.br" && !producaoCoraLigada()) return false;
  return true;
}
