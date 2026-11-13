import { origemDosEmails } from "./logo";

export function tokenPublicoValido(valor: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(valor);
}

export function caminhoPagamentoPix(token: string): string | null {
  if (!tokenPublicoValido(token)) return null;
  return `/pagar/${token}`;
}

export function caminhoQrPix(token: string): string | null {
  if (!tokenPublicoValido(token)) return null;
  return `/api/publico/pix/${token}`;
}

export function absolutizarCaminho(caminho: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const limpo = caminho.trim();
  if (!limpo.startsWith("/")) return null;
  const origem = origemDosEmails(env);
  if (!origem) return null;
  return `${origem}${limpo}`;
}

// Link que e-mail e WhatsApp podem enviar. URL absoluta permanece.
// Caminho /pagar/... vira absoluto quando há origem HTTPS.
export function absolutizarLinkCobranca(link: string, env: NodeJS.ProcessEnv = process.env): string {
  const limpo = link.trim();
  if (/^https?:\/\//i.test(limpo)) return limpo;
  if (limpo.startsWith("/pagar/") || limpo.startsWith("/api/publico/pix/")) {
    return absolutizarCaminho(limpo, env) ?? limpo;
  }
  return limpo;
}
