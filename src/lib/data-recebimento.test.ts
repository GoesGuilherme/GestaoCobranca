import { describe, expect, it } from "vitest";
import { dataRecebimento, pagoNesteMes } from "./data-recebimento";

const HOJE = "2026-11-02";

describe("data de recebimento", () => {
  it("usa pago_em e ignora a atualização quando a data de pagamento existe", () => {
    expect(dataRecebimento("2026-10-15", "2026-11-02")).toBe("2026-10-15");
    expect(dataRecebimento("2026-11-01T00:00:00.000Z", "2026-10-01")).toBe("2026-11-01");
  });

  it("cai em atualizado_em só quando pago_em é nulo ou inválido", () => {
    expect(dataRecebimento(null, "2026-11-02")).toBe("2026-11-02");
    expect(dataRecebimento(undefined, "2026-11-02")).toBe("2026-11-02");
    expect(dataRecebimento("", "2026-11-02")).toBe("2026-11-02");
    expect(dataRecebimento("não-é-data", "2026-11-02")).toBe("2026-11-02");
  });

  it("não conta no mês uma fatura paga em outubro cuja atualização caiu em novembro", () => {
    const outubro = {
      status: "RECEIVED",
      excluida: false,
      pagoEm: "2026-10-15",
      atualizadoEm: "2026-11-02T15:00:00.000Z",
    };
    const novembro = {
      status: "RECEIVED",
      excluida: false,
      pagoEm: "2026-11-01",
      atualizadoEm: "2026-11-02T15:00:00.000Z",
    };
    const semData = {
      status: "RECEIVED",
      excluida: false,
      pagoEm: null,
      atualizadoEm: "2026-11-02T15:00:00.000Z",
    };
    const semDataOutubro = {
      status: "CONFIRMED",
      excluida: false,
      pagoEm: null,
      atualizadoEm: "2026-10-20T15:00:00.000Z",
    };
    const aberta = {
      status: "PENDING",
      excluida: false,
      pagoEm: "2026-11-01",
      atualizadoEm: "2026-11-02T15:00:00.000Z",
    };

    expect(pagoNesteMes(outubro, HOJE)).toBe(false);
    expect(pagoNesteMes(novembro, HOJE)).toBe(true);
    expect(pagoNesteMes(semData, HOJE)).toBe(true);
    expect(pagoNesteMes(semDataOutubro, HOJE)).toBe(false);
    expect(pagoNesteMes(aberta, HOJE)).toBe(false);
  });
});
