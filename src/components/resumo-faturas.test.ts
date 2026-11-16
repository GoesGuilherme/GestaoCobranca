import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResumoFaturasFiltradas } from "@/lib/resumo-faturas";
import { ResumoFaturas, tituloCardFaturas, type FiltrosDoCardFaturas } from "./resumo-faturas";

function textos(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function filtros(parcial: Partial<FiltrosDoCardFaturas> = {}): FiltrosDoCardFaturas {
  return {
    situacao: "todas",
    vista: "todas",
    busca: "",
    campo: "vencimento",
    faixa: null,
    ...parcial,
  };
}

const RESUMO: ResumoFaturasFiltradas = {
  quantidade: 203,
  total: "222.00",
  grupos: [
    { tom: "aberto", rotulo: "Em aberto", quantidade: 201, total: "201.00" },
    { tom: "vencida", rotulo: "Vencidas", quantidade: 2, total: "21.00" },
  ],
};

describe("título do card de faturas", () => {
  it("usa Todas as faturas quando a situação não restringe", () => {
    expect(tituloCardFaturas(filtros())).toBe("Todas as faturas");
  });

  it("nomeia a situação com o mesmo rótulo do filtro", () => {
    expect(tituloCardFaturas(filtros({ situacao: "vencidas" }))).toBe("Faturas vencidas");
    expect(tituloCardFaturas(filtros({ situacao: "pagas" }))).toBe("Faturas pagas");
    expect(tituloCardFaturas(filtros({ situacao: "em_aberto" }))).toBe("Faturas em aberto");
    expect(tituloCardFaturas(filtros({ situacao: "canceladas" }))).toBe("Faturas canceladas");
  });

  it("acrescenta cliente, visualização e datas só quando o filtro está ativo", () => {
    expect(
      tituloCardFaturas(
        filtros({
          situacao: "vencidas",
          busca: "  Padaria  ",
          vista: "nao_vistas",
          faixa: { inicio: "2026-11-01", fim: "2026-11-30" },
        }),
      ),
    ).toBe("Faturas vencidas · Padaria · Não visualizadas · 01/11 a 30/11");

    expect(tituloCardFaturas(filtros({ situacao: "em_aberto", vista: "vistas" }))).toBe(
      "Faturas em aberto · Visualizadas",
    );
    expect(
      tituloCardFaturas(
        filtros({
          situacao: "pagas",
          campo: "pagamento",
          faixa: { inicio: "2026-11-01", fim: "2026-11-30" },
        }),
      ),
    ).toBe("Faturas pagas · Pagamento 01/11 a 30/11");
    expect(tituloCardFaturas(filtros({ faixa: { inicio: "2026-11-01", fim: null } }))).toBe(
      "Todas as faturas · a partir de 01/11",
    );
    expect(tituloCardFaturas(filtros({ faixa: { inicio: null, fim: "2026-11-30" } }))).toBe("Todas as faturas · até 30/11");
    expect(
      tituloCardFaturas(filtros({ faixa: { inicio: "2025-12-01", fim: "2026-01-15" } })),
    ).toBe("Todas as faturas · 01/12/2025 a 15/01/2026");
  });
});

describe("card de total das faturas", () => {
  it("mostra o título do filtro e o total agregado, mesmo acima de 200", () => {
    const texto = textos(
      renderToStaticMarkup(
        createElement(ResumoFaturas, {
          resumo: RESUMO,
          filtros: filtros({ situacao: "em_aberto", busca: "Padaria" }),
        }),
      ),
    );

    expect(texto).toContain("Faturas em aberto · Padaria");
    expect(texto).toContain("R$ 222,00");
    expect(texto).toContain("203 faturas · soma de todo o filtro.");
    expect(texto).toContain("R$ 201,00");
    expect(texto).toContain("201 faturas");
    expect(texto).toContain("R$ 21,00");
    expect(texto).toContain("Em aberto é o que ainda não venceu.");
  });

  it("mostra zero quando o filtro não encontra fatura", () => {
    const texto = textos(
      renderToStaticMarkup(
        createElement(ResumoFaturas, {
          resumo: { quantidade: 0, total: "0.00", grupos: [] },
          filtros: filtros({ situacao: "pagas" }),
        }),
      ),
    );

    expect(texto).toContain("Faturas pagas");
    expect(texto).toContain("R$ 0,00");
    expect(texto).toContain("Nenhuma fatura com estes filtros.");
    expect(texto).not.toContain("soma de todo o filtro");
  });
});
