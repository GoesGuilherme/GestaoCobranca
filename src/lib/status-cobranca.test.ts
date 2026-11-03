import { describe, expect, it } from "vitest";
import {
  faturaElegivelRegua,
  filtroListaFaturas,
  normalizarStatus,
  normalizarStatusAsaas,
  statusEfetivo,
  STATUS_BRUTOS_PAGOS_ASAAS,
} from "./status-cobranca";

const MAPA: Record<string, string> = {
  CRIANDO: "CRIANDO",
  ERRO_EMISSAO: "FALHA",
  PENDING: "PENDENTE",
  AWAITING_RISK_ANALYSIS: "PENDENTE",
  OVERDUE: "VENCIDA",
  DUNNING_REQUESTED: "VENCIDA",
  RECEIVED: "PAGA",
  CONFIRMED: "PAGA",
  RECEIVED_IN_CASH: "PAGA",
  DUNNING_RECEIVED: "PAGA",
  REFUNDED: "ESTORNADA",
  REFUND_REQUESTED: "ESTORNADA",
  REFUND_IN_PROGRESS: "ESTORNADA",
  CHARGEBACK_REQUESTED: "ESTORNADA",
  CHARGEBACK_DISPUTE: "ESTORNADA",
  AWAITING_CHARGEBACK_REVERSAL: "ESTORNADA",
  OUTRO_QUALQUER: "DESCONHECIDO",
};

describe("status normalizado do Asaas", () => {
  it("traduz cada texto cru e aceita o status que já está normalizado", () => {
    for (const [cru, esperado] of Object.entries(MAPA)) {
      expect(normalizarStatusAsaas(cru)).toBe(esperado);
      expect(normalizarStatus(cru)).toBe(esperado);
    }
    expect(normalizarStatus("paga")).toBe("PAGA");
    expect(normalizarStatus("received")).toBe("PAGA");
    expect(normalizarStatus("PAID", "CORA")).toBe("DESCONHECIDO");
    expect(normalizarStatus("PAGA", "CORA")).toBe("PAGA");
  });

  it("trata fatura excluída como cancelada sem perder o mapa de paga", () => {
    expect(statusEfetivo("RECEIVED", false)).toBe("PAGA");
    expect(statusEfetivo("RECEIVED", true)).toBe("CANCELADA");
    expect(statusEfetivo("PENDING", true)).toBe("CANCELADA");
    expect(STATUS_BRUTOS_PAGOS_ASAAS).toEqual(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
  });

  it("mantém a régua só em pendente e vencida do Asaas, fora da análise e da negativação", () => {
    expect(faturaElegivelRegua({ status: "PENDING", excluida: false })).toBe(true);
    expect(faturaElegivelRegua({ status: "OVERDUE", excluida: false })).toBe(true);
    expect(faturaElegivelRegua({ status: "AWAITING_RISK_ANALYSIS", excluida: false })).toBe(false);
    expect(faturaElegivelRegua({ status: "DUNNING_REQUESTED", excluida: false })).toBe(false);
    expect(faturaElegivelRegua({ status: "RECEIVED", excluida: false })).toBe(false);
    expect(faturaElegivelRegua({ status: "PENDING", excluida: true })).toBe(false);
    expect(faturaElegivelRegua({ status: "PENDENTE", excluida: false, provedor: "CORA" })).toBe(true);
    expect(faturaElegivelRegua({ status: "PAGA", excluida: false, provedor: "CORA" })).toBe(false);
  });

  it("filtra lista por status normalizado", () => {
    expect(filtroListaFaturas("pagas")).toEqual({ excluida: false, statusNormalizado: "PAGA" });
    expect(filtroListaFaturas("vencidas")).toEqual({ excluida: false, statusNormalizado: "VENCIDA" });
    expect(filtroListaFaturas("em_aberto").statusNormalizado).toEqual({ in: ["PENDENTE", "VENCIDA"] });
    expect(filtroListaFaturas("todas")).toEqual({ statusNormalizado: { not: "CRIANDO" } });
  });
});
