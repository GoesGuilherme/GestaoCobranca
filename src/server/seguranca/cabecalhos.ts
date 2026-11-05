export type CabecalhoSeguranca = { key: string; value: string };

export function cabecalhosSeguranca(): CabecalhoSeguranca[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
}

// O nonce entra no script. Navegador que entende nonce ignora script inline sem ele.
// O estilo continua com unsafe-inline: o Next e o Tailwind colocam estilo na página.
export function politicaConteudo(nonce: string): string {
  const valor = nonce.replace(/[^A-Za-z0-9+/=]/g, "");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${valor}' 'strict-dynamic'`,
    "connect-src 'self'",
  ].join("; ");
}
