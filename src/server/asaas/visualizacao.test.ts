import { describe, expect, it } from "vitest";
import { instanteMaisAntigo, instanteVisualizacaoAsaas, lerVisualizacaoAsaas } from "./visualizacao";

describe("datas do viewingInfo", () => {
  it("lê o exemplo oficial sem fuso como horário de Brasília", () => {
    expect(instanteVisualizacaoAsaas("2017-06-10 11:00:00")?.toISOString()).toBe("2017-06-10T14:00:00.000Z");
    expect(instanteVisualizacaoAsaas("2017-06-10T11:00:00")?.toISOString()).toBe("2017-06-10T14:00:00.000Z");
  });

  it("respeita fuso quando o Asaas envia", () => {
    expect(instanteVisualizacaoAsaas("2017-06-10T14:00:00Z")?.toISOString()).toBe("2017-06-10T14:00:00.000Z");
    expect(instanteVisualizacaoAsaas("2017-06-10T11:00:00-03:00")?.toISOString()).toBe("2017-06-10T14:00:00.000Z");
  });

  it("ignora vazio e texto inválido", () => {
    expect(instanteVisualizacaoAsaas("")).toBeNull();
    expect(instanteVisualizacaoAsaas("   ")).toBeNull();
    expect(instanteVisualizacaoAsaas("ontem")).toBeNull();
    expect(instanteVisualizacaoAsaas(null)).toBeNull();
  });

  it("separa fatura e boleto e fica com a data mais antiga", () => {
    const lido = lerVisualizacaoAsaas({
      invoiceViewedDate: "2026-10-31 09:15:00",
      boletoViewedDate: "2026-10-30 08:00:00",
    });
    expect(lido.faturaEm?.toISOString()).toBe("2026-10-31T12:15:00.000Z");
    expect(lido.boletoEm?.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(instanteMaisAntigo([lido.faturaEm, lido.boletoEm, null])?.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(lerVisualizacaoAsaas({})).toEqual({ faturaEm: null, boletoEm: null });
    expect(lerVisualizacaoAsaas(null)).toEqual({ faturaEm: null, boletoEm: null });
    expect(instanteMaisAntigo([null, null])).toBeNull();
  });
});
