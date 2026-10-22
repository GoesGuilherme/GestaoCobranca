import { describe, expect, it } from "vitest";
import { dataHojeIso, dataIsoValida } from "./data";
import { formatarReais, formatarValorCampo, normalizarDinheiro, somarDinheiro } from "./dinheiro";
import { podeAlterarServicos } from "./permissoes";

describe("dinheiro em reais", () => {
  it("aceita os formatos usados no Brasil e devolve duas casas", () => {
    expect(normalizarDinheiro("189,90")).toBe("189.90");
    expect(normalizarDinheiro("189.9")).toBe("189.90");
    expect(normalizarDinheiro("1.500,50")).toBe("1500.50");
    expect(normalizarDinheiro("R$ 1.500,50")).toBe("1500.50");
    expect(normalizarDinheiro("1500")).toBe("1500.00");
    expect(normalizarDinheiro("0")).toBe("0.00");
    expect(normalizarDinheiro(",5")).toBe("0.50");
    expect(normalizarDinheiro(10)).toBe("10.00");
  });

  it("rejeita negativo, texto e valor acima do que cabe em decimal(12,2)", () => {
    expect(normalizarDinheiro("-1")).toBeNull();
    expect(normalizarDinheiro("1,999")).toBeNull();
    expect(normalizarDinheiro("dez")).toBeNull();
    expect(normalizarDinheiro("")).toBeNull();
    expect(normalizarDinheiro("10000000000")).toBeNull();
    expect(normalizarDinheiro("9999999999,99")).toBe("9999999999.99");
  });

  it("soma sem usar número de ponto flutuante e formata em reais", () => {
    expect(somarDinheiro(["0.10", "0.20"])).toBe("0.30");
    expect(somarDinheiro([])).toBe("0.00");
    expect(formatarReais("1500.50")).toBe("R$ 1.500,50");
    expect(formatarValorCampo("189.90")).toBe("189,90");
    expect(formatarReais("invalido")).toBe("R$ 0,00");
  });
});

describe("datas e permissão de serviços", () => {
  it("valida a data de início e calcula o dia em São Paulo", () => {
    expect(dataIsoValida("2026-10-22")).toBe(true);
    expect(dataIsoValida("2026-02-31")).toBe(false);
    expect(dataIsoValida("22/10/2026")).toBe(false);
    expect(dataHojeIso(new Date("2026-10-22T02:30:00.000Z"))).toBe("2026-10-21");
    expect(dataHojeIso(new Date("2026-10-22T15:00:00.000Z"))).toBe("2026-10-22");
  });

  it("deixa dono e financeiro alterarem; suporte só consulta", () => {
    expect(podeAlterarServicos("DONO")).toBe(true);
    expect(podeAlterarServicos("FINANCEIRO")).toBe(true);
    expect(podeAlterarServicos("SUPORTE")).toBe(false);
  });
});
