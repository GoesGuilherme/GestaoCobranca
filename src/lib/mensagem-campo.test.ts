import { describe, expect, it } from "vitest";
import { esquemaEsqueciSenha, esquemaLogin, mensagemDoCampo } from "./validacao";

describe("mensagemDoCampo", () => {
  it("devolve a mensagem em português do campo e fica vazia quando vale", () => {
    expect(mensagemDoCampo(esquemaLogin.shape.email, "")).toBe("Informe o e-mail.");
    expect(mensagemDoCampo(esquemaLogin.shape.senha, "segredo")).toBe("");
    expect(mensagemDoCampo(esquemaEsqueciSenha.shape.email, "nao-e-email")).toBe("Informe um e-mail válido.");
  });
});