import { describe, expect, it } from "vitest";
import {
  consultaPeriodo,
  faixaDoPeriodo,
  lerFiltroPeriodo,
  rotuloFaixaPeriodo,
  textoListaFaturas,
} from "./periodo-faturas";

const HOJE = "2026-11-04";

describe("filtro de período das faturas", () => {
  it("começa em todos e vencimento quando a URL não traz o filtro", () => {
    expect(lerFiltroPeriodo({})).toEqual({ periodo: "todos", campo: "vencimento", de: "", ate: "" });
    expect(faixaDoPeriodo(lerFiltroPeriodo({}), HOJE)).toBeNull();
    expect(consultaPeriodo(lerFiltroPeriodo({ periodo: "ano", por: "caixa" }), HOJE)).toBeUndefined();
  });

  it("calcula mês atual, anterior, próximo e os últimos 30 dias", () => {
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "mes_atual" }), HOJE)).toEqual({
      inicio: "2026-11-01",
      fim: "2026-11-30",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "mes_anterior" }), HOJE)).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-31",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "proximo_mes" }), HOJE)).toEqual({
      inicio: "2026-12-01",
      fim: "2026-12-31",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "ultimos_30" }), HOJE)).toEqual({
      inicio: "2026-10-06",
      fim: "2026-11-04",
    });
  });

  it("atravessa a virada do ano e o fevereiro bissexto", () => {
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "mes_anterior" }), "2026-01-01")).toEqual({
      inicio: "2025-12-01",
      fim: "2025-12-31",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "proximo_mes" }), "2026-12-31")).toEqual({
      inicio: "2027-01-01",
      fim: "2027-01-31",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "mes_atual" }), "2024-02-15")).toEqual({
      inicio: "2024-02-01",
      fim: "2024-02-29",
    });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "ultimos_30" }), "2026-01-10")).toEqual({
      inicio: "2025-12-12",
      fim: "2026-01-10",
    });
  });

  it("aceita de/até, inverte a ordem e ignora data inválida", () => {
    const invertido = lerFiltroPeriodo({
      periodo: "personalizado",
      por: "pagamento",
      de: "2026-11-30",
      ate: "2026-11-01",
    });
    expect(invertido.campo).toBe("pagamento");
    expect(faixaDoPeriodo(invertido, HOJE)).toEqual({ inicio: "2026-11-01", fim: "2026-11-30" });
    expect(consultaPeriodo(invertido, HOJE)).toEqual({
      campo: "pagamento",
      inicio: "2026-11-01",
      fim: "2026-11-30",
    });

    expect(
      faixaDoPeriodo(lerFiltroPeriodo({ periodo: "personalizado", de: "2026-03-10", ate: "31/03/2026" }), HOJE),
    ).toEqual({ inicio: "2026-03-10", fim: null });
    expect(faixaDoPeriodo(lerFiltroPeriodo({ periodo: "personalizado", de: "amanha" }), HOJE)).toBeNull();
  });

  it("escreve o período e a contagem em português curto", () => {
    expect(rotuloFaixaPeriodo("vencimento", { inicio: "2026-11-01", fim: "2026-11-30" })).toBe(
      "Vencimento de 01/11/2026 a 30/11/2026.",
    );
    expect(rotuloFaixaPeriodo("pagamento", { inicio: "2026-10-06", fim: null })).toBe(
      "Pagamento a partir de 06/10/2026.",
    );
    expect(rotuloFaixaPeriodo("vencimento", { inicio: null, fim: "2026-12-31" })).toBe("Vencimento até 31/12/2026.");
    expect(textoListaFaturas(0)).toBe("0 faturas nesta lista");
    expect(textoListaFaturas(1)).toBe("1 fatura nesta lista");
    expect(textoListaFaturas(12)).toBe("12 faturas nesta lista");
  });
});
