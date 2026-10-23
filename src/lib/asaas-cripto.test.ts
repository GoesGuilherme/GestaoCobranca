import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  cifrarSegredoAsaas,
  decifrarSegredoAsaas,
  gerarTokenWebhook,
  hashTokenWebhook,
  mascararChave,
} from "./asaas-cripto";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("cifra do Asaas", () => {
  it("guarda o segredo ilegível e devolve o mesmo texto", () => {
    const segredo = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
    const pacote = cifrarSegredoAsaas(segredo);
    expect(pacote.startsWith("v1:")).toBe(true);
    expect(pacote).not.toContain(segredo);
    expect(decifrarSegredoAsaas(pacote)).toBe(segredo);
    expect(cifrarSegredoAsaas(segredo)).not.toBe(pacote);
  });

  it("recusa pacote adulterado e chave ausente", () => {
    const pacote = cifrarSegredoAsaas("token-do-webhook-com-mais-de-trinta-e-dois");
    const partes = pacote.split(":");
    partes[3] = `${partes[3].slice(0, -1)}${partes[3].endsWith("a") ? "b" : "a"}`;
    expect(() => decifrarSegredoAsaas(partes.join(":"))).toThrow(/ilegível/);
    const anterior = process.env.ASAAS_ENCRYPTION_KEY;
    delete process.env.ASAAS_ENCRYPTION_KEY;
    expect(() => cifrarSegredoAsaas("qualquer-segredo-longo")).toThrow(/ASAAS_ENCRYPTION_KEY/);
    process.env.ASAAS_ENCRYPTION_KEY = anterior;
  });

  it("mascara só os quatro últimos e o token do webhook não é a chave", () => {
    expect(mascararChave("0001")).toBe("••••0001");
    const token = gerarTokenWebhook();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token.length).toBeLessThanOrEqual(255);
    expect(/\s/.test(token)).toBe(false);
    expect(token.startsWith("$aact_")).toBe(false);
    expect(hashTokenWebhook(token)).toHaveLength(64);
  });
});
