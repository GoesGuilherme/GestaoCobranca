import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaTwilio, assinaturaTwilioValida } from "./twilio-assinatura";

const URL = "https://taguaro.test/api/webhooks/twilio";
const TOKEN = "token-de-teste-twilio";
const PARAMS = {
  AccountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  From: "whatsapp:+5513988881001",
  MessageStatus: "delivered",
};

function assinaturaIndependente(url: string, parametros: Record<string, string>, token: string) {
  const base = Object.keys(parametros)
    .sort()
    .reduce((acc, chave) => acc + chave + parametros[chave], url);
  return createHmac("sha1", token).update(base, "utf8").digest("base64");
}

describe("assinatura X-Twilio-Signature", () => {
  it("aceita o HMAC-SHA1 do URL e dos campos em ordem", () => {
    const assinatura = assinaturaIndependente(URL, PARAMS, TOKEN);
    expect(assinaturaTwilio(URL, PARAMS, TOKEN)).toBe(assinatura);
    expect(assinaturaTwilioValida({ url: URL, parametros: PARAMS, assinatura, authToken: TOKEN })).toBe(true);
  });

  it("recusa token, URL ou corpo diferentes e não quebra com tamanho diferente", () => {
    const assinatura = assinaturaIndependente(URL, PARAMS, TOKEN);
    expect(assinaturaTwilioValida({ url: URL, parametros: PARAMS, assinatura, authToken: "outro-token" })).toBe(false);
    expect(assinaturaTwilioValida({ url: `${URL}?x=1`, parametros: PARAMS, assinatura, authToken: TOKEN })).toBe(false);
    expect(
      assinaturaTwilioValida({
        url: URL,
        parametros: { ...PARAMS, MessageStatus: "failed" },
        assinatura,
        authToken: TOKEN,
      }),
    ).toBe(false);
    expect(assinaturaTwilioValida({ url: URL, parametros: PARAMS, assinatura: "curta", authToken: TOKEN })).toBe(false);
    expect(assinaturaTwilioValida({ url: URL, parametros: PARAMS, assinatura: "", authToken: TOKEN })).toBe(false);
  });
});
