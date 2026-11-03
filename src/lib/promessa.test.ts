import { describe, expect, it } from "vitest";
import {
  desfechoPromessa,
  faturaAceitaPromessa,
  promessaCobreHoje,
  rotuloPromessaAte,
  taxaCumprimento,
} from "./promessa";

const HOJE = "2026-11-03";

describe("desfecho da promessa", () => {
  it("paga no dia prometido ou antes fica cumprida", () => {
    expect(
      desfechoPromessa({
        status: "PENDENTE",
        dataPrometida: "2026-11-10",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "RECEIVED",
        pagoEm: "2026-11-10",
      }).status,
    ).toBe("CUMPRIDA");
    expect(
      desfechoPromessa({
        status: "PENDENTE",
        dataPrometida: "2026-11-10",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "CONFIRMED",
        pagoEm: "2026-11-01",
      }).status,
    ).toBe("CUMPRIDA");
  });

  it("paga depois fica cumprida com atraso, mesmo se já estava quebrada", () => {
    const depois = desfechoPromessa({
      status: "QUEBRADA",
      dataPrometida: "2026-11-01",
      hoje: HOJE,
      faturaExcluida: false,
      faturaStatus: "RECEIVED",
      pagoEm: "2026-11-04",
    });
    expect(depois.status).toBe("CUMPRIDA_COM_ATRASO");
    expect(depois.cumpridaEm).toBe("2026-11-04");
    expect(depois.quebradaEm).toBeNull();
  });

  it("sem pagamento depois do dia prometido fica quebrada e no dia ainda está pendente", () => {
    expect(
      desfechoPromessa({
        status: "PENDENTE",
        dataPrometida: "2026-11-02",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "OVERDUE",
        pagoEm: null,
      }).status,
    ).toBe("QUEBRADA");
    expect(
      desfechoPromessa({
        status: "PENDENTE",
        dataPrometida: HOJE,
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "PENDING",
        pagoEm: null,
      }).status,
    ).toBe("PENDENTE");
  });

  it("fatura cancelada cancela a pendente e a cancelada por pessoa não reabre", () => {
    expect(
      desfechoPromessa({
        status: "PENDENTE",
        dataPrometida: "2026-11-20",
        hoje: HOJE,
        faturaExcluida: true,
        faturaStatus: "PENDING",
        pagoEm: null,
      }).status,
    ).toBe("CANCELADA");
    expect(
      desfechoPromessa({
        status: "CANCELADA",
        dataPrometida: "2026-11-20",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "RECEIVED",
        pagoEm: "2026-11-01",
      }).status,
    ).toBe("CANCELADA");
  });

  it("estorno de uma cumprida volta para pendente ou quebrada conforme a data", () => {
    expect(
      desfechoPromessa({
        status: "CUMPRIDA",
        dataPrometida: "2026-11-20",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "REFUNDED",
        pagoEm: null,
      }).status,
    ).toBe("PENDENTE");
    expect(
      desfechoPromessa({
        status: "CUMPRIDA_COM_ATRASO",
        dataPrometida: "2026-10-01",
        hoje: HOJE,
        faturaExcluida: false,
        faturaStatus: "PENDING",
        pagoEm: null,
      }).status,
    ).toBe("QUEBRADA");
  });
});

describe("régua e taxa", () => {
  it("a promessa cobre o dia prometido e para no dia seguinte", () => {
    expect(promessaCobreHoje("PENDENTE", HOJE, HOJE)).toBe(true);
    expect(promessaCobreHoje("PENDENTE", "2026-11-02", HOJE)).toBe(false);
    expect(promessaCobreHoje("QUEBRADA", "2026-11-10", HOJE)).toBe(false);
    expect(rotuloPromessaAte("2026-11-05")).toBe("Promessa até 05/11");
  });

  it("só fatura em aberto ou vencida aceita promessa nova", () => {
    expect(faturaAceitaPromessa("PENDING", false)).toBe(true);
    expect(faturaAceitaPromessa("OVERDUE", false)).toBe(true);
    expect(faturaAceitaPromessa("RECEIVED", false)).toBe(false);
    expect(faturaAceitaPromessa("PENDING", true)).toBe(false);
  });

  it("a taxa conta o atraso como cumprimento e some sem desfecho", () => {
    expect(taxaCumprimento(3, 1)).toBe("75.0");
    expect(taxaCumprimento(0, 2)).toBe("0.0");
    expect(taxaCumprimento(0, 0)).toBeNull();
    expect(taxaCumprimento(1, 2)).toBe("33.3");
  });
});
