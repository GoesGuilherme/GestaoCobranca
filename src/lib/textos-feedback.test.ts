import { describe, expect, it } from "vitest";
import { textoImportacaoFaturas, textoResultadoLote, tomDoLote } from "./textos-feedback";

describe("resultado do lote de recorrência", () => {
  it("conta ativações e falhas em português", () => {
    expect(textoResultadoLote(3, 0)).toBe("3 recorrências ativadas.");
    expect(textoResultadoLote(1, 0)).toBe("1 recorrência ativada.");
    expect(textoResultadoLote(0, 2)).toBe("Nenhuma recorrência ativada. 2 não entraram.");
    expect(textoResultadoLote(2, 1)).toBe("2 recorrências ativadas. 1 não entrou.");
  });

  it("escolhe o tom do aviso pelo que deu certo", () => {
    expect(tomDoLote(2, 0)).toBe("ok");
    expect(tomDoLote(2, 1)).toBe("alerta");
    expect(tomDoLote(0, 1)).toBe("erro");
  });
});

describe("importação de faturas", () => {
  it("resume contagens e o caso sem novidade", () => {
    expect(textoImportacaoFaturas(0, 0, 0)).toBe(
      "Nenhuma cobrança nova no Asaas para os clientes já vinculados.",
    );
    expect(textoImportacaoFaturas(1, 2, 0)).toBe("1 fatura nova. 2 atualizadas.");
    expect(textoImportacaoFaturas(4, 1, 3)).toBe("4 faturas novas. 1 atualizada. 3 ignoradas.");
  });
});
