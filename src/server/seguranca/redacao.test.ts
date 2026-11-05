import { describe, expect, it } from "vitest";
import { mensagemLogSegura, redigirTexto } from "./redacao";

describe("redação de log", () => {
  it("esconde chave, bearer e QR antes de gravar o erro", () => {
    const texto = redigirTexto(
      "falha apikey=chave-evolution-super-secreta bearer abcdefghijklmnop $aact_hmlg_teste data:image/png;base64,AAAA",
    );
    expect(texto).not.toContain("chave-evolution-super-secreta");
    expect(texto).not.toContain("abcdefghijklmnop");
    expect(texto).not.toContain("$aact_");
    expect(texto).toContain("[redigido]");
    expect(mensagemLogSegura(new Error("apikey=chave-evolution-super-secreta"))).not.toContain("chave-evolution-super-secreta");
  });
});
