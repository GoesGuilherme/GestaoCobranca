import { describe, expect, it } from "vitest";
import {
  COOKIE_TOAST,
  DURACAO_ERRO_MS,
  DURACAO_SUCESSO_MS,
  TEXTO_CAMPOS_OBRIGATORIOS,
  TEXTO_ERRO_GENERICO,
  interpretarFlash,
  lerFlashDoCabecalho,
  mensagemErroVisivel,
  serializarFlash,
} from "./notificacao";

describe("toast", () => {
  it("mantém o sucesso curto e o erro um pouco mais", () => {
    expect(DURACAO_SUCESSO_MS).toBeGreaterThanOrEqual(3000);
    expect(DURACAO_SUCESSO_MS).toBeLessThanOrEqual(4000);
    expect(DURACAO_ERRO_MS).toBeGreaterThan(DURACAO_SUCESSO_MS);
  });

  it("usa a frase dos campos obrigatórios", () => {
    expect(TEXTO_CAMPOS_OBRIGATORIOS).toBe("Preencha os campos obrigatórios");
  });

  it("mostra o erro do servidor e esconde stack e segredo", () => {
    expect(mensagemErroVisivel("Cliente já cadastrado.")).toBe("Cliente já cadastrado.");
    expect(mensagemErroVisivel("  ")).toBe(TEXTO_ERRO_GENERICO);
    expect(mensagemErroVisivel("falhou\n    at salvar (node_modules/app.js:1:1)")).toBe(TEXTO_ERRO_GENERICO);
    expect(mensagemErroVisivel("postgres://user:senha@localhost/db")).toBe(TEXTO_ERRO_GENERICO);
    expect(mensagemErroVisivel("Bearer abcdefghijklmnop")).toBe(TEXTO_ERRO_GENERICO);
  });

  it("grava e lê o flash que sobrevive à navegação", () => {
    const valor = serializarFlash({ tipo: "sucesso", mensagem: "Cliente salvo" });
    expect(interpretarFlash(valor)).toEqual({ tipo: "sucesso", mensagem: "Cliente salvo" });
    const cookie = `outra=1; ${COOKIE_TOAST}=${valor}`;
    expect(lerFlashDoCabecalho(cookie)?.mensagem).toBe("Cliente salvo");
    expect(interpretarFlash("lixo")).toBeNull();
  });
});
