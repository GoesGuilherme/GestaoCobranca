import { describe, expect, it } from "vitest";
import { dataHojeIso, dataIsoValida, proximoVencimentoIso } from "./data";
import {
  calcularImposto,
  calcularMargem,
  compararDinheiro,
  formatarAliquota,
  formatarPercentual,
  formatarReais,
  formatarReaisAssinado,
  formatarValorCampo,
  margemFinanceira,
  normalizarAliquota,
  normalizarDinheiro,
  percentualSobre,
  somarDinheiro,
  somarDinheiroAssinado,
} from "./dinheiro";
import { podeAlterarServicos, podeVerCustoServico, podeVerFaturas, podeVerResultado } from "./permissoes";

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

  it("trata a alíquota como percentual de 0 a 100 e calcula a margem em centavos", () => {
    expect(normalizarAliquota("5")).toBe("5.00");
    expect(normalizarAliquota("5,5%")).toBe("5.50");
    expect(normalizarAliquota("100")).toBe("100.00");
    expect(normalizarAliquota("100,01")).toBeNull();
    expect(normalizarAliquota("-1")).toBeNull();
    expect(formatarAliquota("5.00")).toBe("5%");
    expect(formatarAliquota("5.50")).toBe("5,50%");

    expect(calcularMargem("200.00", null, null)).toBeNull();
    expect(calcularMargem("200.00", "50.00", "5.00")).toBe("140.00");
    expect(calcularMargem("100.00", "50.00", "5.00")).toBe("45.00");
    expect(calcularMargem("189.90", null, "5.00")).toBe("180.40");
    expect(calcularMargem("10.00", "30.00", null)).toBe("-20.00");
    expect(formatarReaisAssinado("-20.00")).toBe("-R$ 20,00");
    expect(formatarReaisAssinado("140.00")).toBe("R$ 140,00");
    expect(calcularImposto("189.90", "5.00")).toBe("9.50");
    expect(calcularImposto("100.00", null)).toBe("0.00");
    expect(margemFinanceira("100.00", null, null)).toBe("100.00");
    expect(percentualSobre("320.40", "389.90")).toBe("82.17");
    expect(percentualSobre("-20.00", "10.00")).toBe("-200.00");
    expect(percentualSobre("10.00", "0.00")).toBeNull();
    expect(formatarPercentual("70.00")).toBe("70%");
    expect(formatarPercentual("-200.00")).toBe("-200%");
    expect(formatarPercentual("82.17")).toBe("82,17%");
    expect(somarDinheiroAssinado(["140.00", "-20.00"])).toBe("120.00");
    expect(compararDinheiro("10.00", "2.00")).toBe(1);
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
    expect(proximoVencimentoIso(28, "2026-10-23")).toBe("2026-10-28");
    expect(proximoVencimentoIso(10, "2026-10-23")).toBe("2026-11-10");
    expect(proximoVencimentoIso(31, "2026-02-01")).toBe("2026-02-28");
    expect(proximoVencimentoIso(31, "2026-01-31")).toBe("2026-02-28");
    expect(proximoVencimentoIso(0, "2026-10-23")).toBeNull();
  });

  it("deixa dono e financeiro alterarem; suporte só consulta", () => {
    expect(podeAlterarServicos("DONO")).toBe(true);
    expect(podeAlterarServicos("FINANCEIRO")).toBe(true);
    expect(podeAlterarServicos("SUPORTE")).toBe(false);
    expect(podeVerCustoServico("DONO")).toBe(true);
    expect(podeVerCustoServico("FINANCEIRO")).toBe(true);
    expect(podeVerCustoServico("SUPORTE")).toBe(false);
    expect(podeVerResultado("DONO")).toBe(true);
    expect(podeVerResultado("FINANCEIRO")).toBe(false);
    expect(podeVerResultado("SUPORTE")).toBe(false);
    expect(podeVerFaturas("DONO")).toBe(true);
    expect(podeVerFaturas("FINANCEIRO")).toBe(true);
    expect(podeVerFaturas("SUPORTE")).toBe(false);
  });
});
