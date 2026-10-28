import { describe, expect, it } from "vitest";
import { montarEmailRedefinicao, sessaoCompativel, VALIDADE_REDEFINICAO_MS } from "./redefinicao-senha";
import { hashTokenRedefinicao, novoTokenRedefinicao } from "@/server/auth/token-redefinicao";

describe("token de redefinição", () => {
  it("guarda só o hash e o link vale uma hora", () => {
    const { token, tokenHash } = novoTokenRedefinicao();
    expect(tokenHash).toBe(hashTokenRedefinicao(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(VALIDADE_REDEFINICAO_MS).toBe(60 * 60 * 1000);
  });

  it("a sessão antiga deixa de valer quando a versão muda", () => {
    expect(sessaoCompativel(0, 0)).toBe(true);
    expect(sessaoCompativel(1, 1)).toBe(true);
    expect(sessaoCompativel(0, 1)).toBe(false);
  });

  it("o e-mail leva o link e não o hash", () => {
    const { token, tokenHash } = novoTokenRedefinicao();
    const link = `https://exemplo.test/redefinir-senha?token=${token}`;
    const carta = montarEmailRedefinicao(link);
    expect(carta.assunto).toBe("Redefinir sua senha no Taguaro");
    expect(carta.texto).toContain(link);
    expect(carta.html).toContain(link);
    expect(carta.texto).not.toContain(tokenHash);
    expect(carta.html).not.toContain(tokenHash);
  });
});
