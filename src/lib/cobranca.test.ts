import { describe, expect, it } from "vitest";
import { descreverCobranca, mesDaCobranca } from "./cobranca";
import { esquemaAtivarRecorrencia } from "./validacao";

describe("descrição da cobrança", () => {
  it("troca os marcadores do modelo da empresa", () => {
    expect(mesDaCobranca("2026-11-10")).toBe("novembro de 2026");
    expect(
      descreverCobranca("Mensalidade {servico} de {cliente} em {mes}", {
        servico: "Licença mensal",
        cliente: "Cantina da Praia",
        vencimento: "2026-11-10",
      }),
    ).toBe("Mensalidade Licença mensal de Cantina da Praia em novembro de 2026");
  });

  it("usa o modelo genérico quando o texto vem vazio e deixa marcador desconhecido", () => {
    expect(
      descreverCobranca("  ", {
        servico: "Suporte",
        cliente: "Mercado",
        vencimento: "2026-02-28",
      }),
    ).toBe("Mensalidade Suporte");
    expect(
      descreverCobranca("{outro}", {
        servico: "Suporte",
        cliente: "Mercado",
        vencimento: "2026-02-28",
      }),
    ).toBe("{outro}");
  });

  it("deixa dia e percentuais ausentes para a preferência da empresa entrar", () => {
    const lido = esquemaAtivarRecorrencia.parse({});
    expect(lido.diaVencimento).toBeUndefined();
    expect(lido.multaPercentual).toBeUndefined();
    expect(lido.descontoPercentual).toBeUndefined();
    expect(esquemaAtivarRecorrencia.parse({ multaPercentual: "" }).multaPercentual).toBeNull();
    expect(esquemaAtivarRecorrencia.parse({ multaPercentual: "0" }).multaPercentual).toBe("0.00");
  });
});
