import { describe, expect, it } from "vitest";
import { somarDinheiro } from "./dinheiro";
import {
  resumoFaturasFiltradas,
  textoQuantidadeFaturas,
  textoTotalFiltrado,
  type FaturaParaResumo,
} from "./resumo-faturas";

function linha(valor: string, status: string, excluida = false): FaturaParaResumo {
  return { valor, status, excluida };
}

describe("resumo das faturas filtradas", () => {
  it("soma a lista inteira, além da página de 20", () => {
    const faturas = Array.from({ length: 25 }, () => linha("10.00", "PENDING"));
    const resumo = resumoFaturasFiltradas(faturas);

    expect(resumo.quantidade).toBe(25);
    expect(resumo.total).toBe("250.00");
    expect(resumo.grupos).toEqual([{ tom: "aberto", rotulo: "Em aberto", quantidade: 25, total: "250.00" }]);
  });

  it("separa por situação e os grupos fecham o total", () => {
    const resumo = resumoFaturasFiltradas([
      linha("100.50", "PENDING"),
      linha("40.25", "OVERDUE"),
      linha("1234.56", "RECEIVED"),
      linha("10.00", "PENDING", true),
      linha("5.10", "REFUNDED"),
      linha("0.01", "LATE"),
    ]);

    expect(resumo.quantidade).toBe(6);
    expect(resumo.total).toBe("1390.42");
    expect(resumo.grupos).toEqual([
      { tom: "aberto", rotulo: "Em aberto", quantidade: 1, total: "100.50" },
      { tom: "vencida", rotulo: "Vencidas", quantidade: 2, total: "40.26" },
      { tom: "paga", rotulo: "Pagas", quantidade: 1, total: "1234.56" },
      { tom: "cancelada", rotulo: "Canceladas", quantidade: 1, total: "10.00" },
      { tom: "estorno", rotulo: "Estornadas", quantidade: 1, total: "5.10" },
    ]);
    expect(somarDinheiro(resumo.grupos.map((grupo) => grupo.total))).toBe(resumo.total);
  });

  it("trata fatura excluída como cancelada mesmo vencida", () => {
    const resumo = resumoFaturasFiltradas([linha("80.00", "OVERDUE", true), linha("20.00", "CANCELADO")]);

    expect(resumo.grupos).toEqual([{ tom: "cancelada", rotulo: "Canceladas", quantidade: 2, total: "100.00" }]);
    expect(resumo.total).toBe("100.00");
  });

  it("omite situações que não aparecem no filtro", () => {
    const resumo = resumoFaturasFiltradas([linha("15.00", "PAGA"), linha("1.50", "CONFIRMED")]);

    expect(resumo.grupos.map((grupo) => grupo.rotulo)).toEqual(["Pagas"]);
    expect(resumo.total).toBe("16.50");
  });

  it("devolve zero quando o filtro não acha fatura", () => {
    expect(resumoFaturasFiltradas([])).toEqual({ quantidade: 0, total: "0.00", grupos: [] });
    expect(textoTotalFiltrado(0)).toBe("Nenhuma fatura com estes filtros.");
  });

  it("conta no singular e avisa que a soma atravessa as páginas", () => {
    expect(textoQuantidadeFaturas(1)).toBe("1 fatura");
    expect(textoQuantidadeFaturas(12)).toBe("12 faturas");
    expect(textoTotalFiltrado(1)).toBe("1 fatura · soma de todas as páginas.");
    expect(textoTotalFiltrado(12)).toBe("12 faturas · soma de todas as páginas.");
  });
});
