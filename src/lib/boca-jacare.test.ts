import { describe, expect, it } from "vitest";
import {
  hrefBocaJacare,
  lerHorizonteBoca,
  mesesDoHorizonte,
  montarBocaJacare,
  situacaoDoMes,
  textoSituacao,
  type LinhaBoca,
} from "./boca-jacare";

const HOJE = "2026-10-27";

function linha(parcial: Partial<LinhaBoca> & Pick<LinhaBoca, "mes">): LinhaBoca {
  return {
    mes: parcial.mes,
    faturado: parcial.faturado ?? "0.00",
    recebido: parcial.recebido ?? "0.00",
    inadimplente: parcial.inadimplente ?? "0.00",
    aVencer: parcial.aVencer ?? "0.00",
  };
}

function boca(
  linhas: LinhaBoca[],
  horizonte: 6 | 12 = 12,
  resumo: { inadimplente: string; base: string } = { inadimplente: "0.00", base: "0.00" },
) {
  return montarBocaJacare({ linhas, horizonte, hoje: HOJE, resumo });
}

describe("boca de jacaré", () => {
  it("aceita 6 ou 12 meses e cai em 12 quando o filtro é outro", () => {
    expect(lerHorizonteBoca("6")).toBe(6);
    expect(lerHorizonteBoca("12")).toBe(12);
    expect(lerHorizonteBoca(undefined)).toBe(12);
    expect(lerHorizonteBoca("3")).toBe(12);
    expect(lerHorizonteBoca("12meses")).toBe(12);
  });

  it("monta o endereço do gráfico sem perder os filtros do financeiro", () => {
    expect(
      hrefBocaJacare({ periodo: "ultimos_3", forma: "PIX", statusCliente: "ATIVO" }, 6),
    ).toBe("/dashboards/financeiro?periodo=ultimos_3&forma=PIX&status=ATIVO&boca=6");
    expect(hrefBocaJacare({ periodo: "este_mes", forma: null, statusCliente: null }, 12)).toBe(
      "/dashboards/financeiro?boca=12",
    );
  });

  it("abre doze meses até o mês corrente e marca fechado, parcial e futuro", () => {
    expect(mesesDoHorizonte(HOJE, 12)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(mesesDoHorizonte(HOJE, 6)[0]).toBe("2026-05");
    expect(mesesDoHorizonte("2026-01-15", 6)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(situacaoDoMes("2026-09", HOJE)).toBe("fechado");
    expect(situacaoDoMes("2026-10", HOJE)).toBe("parcial");
    expect(situacaoDoMes("2026-11", HOJE)).toBe("futuro");
    expect(textoSituacao("fechado", HOJE)).toBeNull();
    expect(textoSituacao("parcial", HOJE)).toContain("27/10/2026");
    expect(textoSituacao("parcial", HOJE)).toContain("vence hoje ou depois");
    expect(textoSituacao("futuro", HOJE)).toContain("já marcada como vencida");
  });

  it("no mês fechado a faixa é o que foi faturado e não entrou", () => {
    const grafico = boca([
      linha({ mes: "2026-09", faturado: "1000.00", recebido: "600.00", inadimplente: "400.00" }),
    ]);
    const setembro = grafico.meses.find((mes) => mes.mes === "2026-09");
    expect(setembro).toMatchObject({
      situacao: "fechado",
      rotuloEixo: "set/26",
      faturado: "1000.00",
      recebido: "600.00",
      inadimplente: "400.00",
      aVencer: "0.00",
      outros: "0.00",
      taxa: "40.0",
      nota: null,
    });
    expect(setembro?.faturadoNum).toBe(1000);
    expect(setembro?.inadimplenteNum).toBe(400);
  });

  it("no mês corrente a inadimplência não engole o que ainda não venceu", () => {
    const grafico = boca([
      linha({
        mes: "2026-10",
        faturado: "1000.00",
        recebido: "200.00",
        inadimplente: "100.00",
        aVencer: "700.00",
      }),
    ]);
    const outubro = grafico.meses.find((mes) => mes.mes === "2026-10");
    expect(outubro).toMatchObject({
      situacao: "parcial",
      rotuloEixo: "out/26*",
      inadimplente: "100.00",
      aVencer: "700.00",
      outros: "0.00",
      taxa: "10.0",
    });
    expect(outubro?.nota).toContain("antes de 27/10/2026");
    expect(outubro?.aVencerNum).toBe(700);
  });

  it("guarda status fora do recebido e do em aberto como outras situações", () => {
    const grafico = boca([
      linha({ mes: "2026-08", faturado: "150.00", recebido: "40.00", inadimplente: "50.00", aVencer: "0.00" }),
    ]);
    expect(grafico.meses.find((mes) => mes.mes === "2026-08")?.outros).toBe("60.00");
  });

  it("preenche mês sem movimento, soma linha repetida e ignora mês fora do recorte", () => {
    const grafico = boca(
      [
        linha({ mes: "2026-09", faturado: "10.00", recebido: "4.00", inadimplente: "6.00" }),
        linha({ mes: "2026-09", faturado: "5.50", recebido: "1.50", inadimplente: "4.00" }),
        linha({ mes: "2026-11", faturado: "999.00", recebido: "0.00", inadimplente: "1.00", aVencer: "998.00" }),
        linha({ mes: "mes-invalido", faturado: "10.00" }),
        linha({ mes: "2026-05", faturado: "lixo", recebido: "2.00", inadimplente: "0.00" }),
      ],
      6,
    );
    expect(grafico.meses).toHaveLength(6);
    expect(grafico.meses.map((mes) => mes.mes)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(grafico.meses.find((mes) => mes.mes === "2026-09")).toMatchObject({
      faturado: "15.50",
      recebido: "5.50",
      inadimplente: "10.00",
      taxa: "64.5",
    });
    expect(grafico.meses.find((mes) => mes.mes === "2026-06")).toMatchObject({
      faturado: "0.00",
      recebido: "0.00",
      inadimplente: "0.00",
      taxa: null,
      situacao: "fechado",
    });
    expect(grafico.meses.find((mes) => mes.mes === "2026-05")?.faturado).toBe("0.00");
    expect(grafico.meses.some((mes) => mes.mes === "2026-11")).toBe(false);
    expect(grafico.vazio).toBe(false);
  });

  it("a taxa atual usa o estoque vencido da empresa, mesmo fora dos meses do gráfico", () => {
    const comPassado = boca(
      [linha({ mes: "2026-10", faturado: "100.00", recebido: "40.00", inadimplente: "60.00" })],
      12,
      { inadimplente: "160.00", base: "400.00" },
    );
    expect(comPassado.resumo).toEqual({
      inadimplente: "160.00",
      base: "400.00",
      taxa: "40.0",
      foraDoGrafico: true,
    });

    const soNoGrafico = boca(
      [linha({ mes: "2026-09", faturado: "80.00", recebido: "30.00", inadimplente: "50.00" })],
      12,
      { inadimplente: "50.00", base: "80.00" },
    );
    expect(soNoGrafico.resumo.foraDoGrafico).toBe(false);
    expect(soNoGrafico.resumo.taxa).toBe("62.5");
  });

  it("sem faturamento vencido a taxa atual fica vazia e o gráfico zerado também", () => {
    const grafico = boca([], 12, { inadimplente: "0.00", base: "0.00" });
    expect(grafico.vazio).toBe(true);
    expect(grafico.resumo.taxa).toBeNull();
    expect(grafico.meses.at(-1)?.situacao).toBe("parcial");
  });
});
