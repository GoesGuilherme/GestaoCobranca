import { createHmac, timingSafeEqual } from "node:crypto";

// Validação oficial do webhook da Twilio:
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
// HMAC-SHA1 do URL exato mais os campos do POST em ordem alfabética, em base64.
export function assinaturaTwilio(url: string, parametros: Record<string, string>, authToken: string): string {
  const base = Object.keys(parametros)
    .sort()
    .reduce((acc, chave) => acc + chave + parametros[chave], url);
  return createHmac("sha1", authToken).update(base, "utf8").digest("base64");
}

export function assinaturaTwilioValida(dados: {
  url: string;
  parametros: Record<string, string>;
  assinatura: string;
  authToken: string;
}): boolean {
  const recebida = dados.assinatura.trim();
  if (!recebida || !dados.authToken || !dados.url) return false;
  const esperada = assinaturaTwilio(dados.url, dados.parametros, dados.authToken);
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
