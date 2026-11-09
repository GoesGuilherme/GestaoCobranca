import { describe, expect, it } from "vitest";
import {
  statusBrutos,
  statusEh,
  statusIgnoradoNoSelo,
  statusNormalizado,
  STATUS_NORMALIZADO,
} from "./status-pagamento";

const HISTORICO = {
  PAGO: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"],
  VENCIDO: ["OVERDUE", "DUNNING_REQUESTED"],
  PENDENTE: ["PENDING", "AWAITING_RISK_ANALYSIS"],
  ESTORNADO: [
    "REFUNDED",
    "REFUND_REQUESTED",
    "REFUND_IN_PROGRESS",
    "CHARGEBACK_REQUESTED",
    "CHARGEBACK_DISPUTE",
    "AWAITING_CHARGEBACK_REVERSAL",
  ],
  REGUA: ["PENDING", "OVERDUE"],
  RECORRENCIA: ["PENDING", "AWAITING_RISK_ANALYSIS", "OVERDUE", "DUNNING_REQUESTED"],
};

describe("status normalizado do Taguaro", () => {
  it("traduz cada status do Asaas sem inventar grupo novo", () => {
    expect(statusBrutos("PAGO")).toEqual(HISTORICO.PAGO);
    expect(statusBrutos("VENCIDO")).toEqual(HISTORICO.VENCIDO);
    expect(statusBrutos("PENDENTE")).toEqual(HISTORICO.PENDENTE);
    expect(statusBrutos("ESTORNADO")).toEqual(HISTORICO.ESTORNADO);
    expect(statusBrutos("REGUA_ABERTA")).toEqual(HISTORICO.REGUA);
    expect(statusBrutos("RECORRENCIA_ABERTA")).toEqual(HISTORICO.RECORRENCIA);
    expect(statusBrutos("CRIANDO")).toEqual(["CRIANDO"]);
    expect(statusBrutos("FALHA")).toEqual(["ERRO_EMISSAO"]);
    expect(statusBrutos("CANCELADO")).toEqual([]);
  });

  it("a régua não trata análise de risco nem negativação como cobrança em aberto", () => {
    expect(statusNormalizado("PENDING")).toBe(STATUS_NORMALIZADO.PENDENTE);
    expect(statusNormalizado("AWAITING_RISK_ANALYSIS")).toBe(STATUS_NORMALIZADO.PENDENTE);
    expect(statusEh("PENDING", "REGUA_ABERTA")).toBe(true);
    expect(statusEh("AWAITING_RISK_ANALYSIS", "REGUA_ABERTA")).toBe(false);
    expect(statusNormalizado("OVERDUE")).toBe(STATUS_NORMALIZADO.VENCIDO);
    expect(statusNormalizado("DUNNING_REQUESTED")).toBe(STATUS_NORMALIZADO.VENCIDO);
    expect(statusEh("OVERDUE", "REGUA_ABERTA")).toBe(true);
    expect(statusEh("DUNNING_REQUESTED", "REGUA_ABERTA")).toBe(false);
  });

  it("pagamento, estorno, rascunho e status desconhecido", () => {
    for (const bruto of HISTORICO.PAGO) expect(statusNormalizado(bruto)).toBe("PAGO");
    expect(statusNormalizado("received")).toBe("PAGO");
    expect(statusNormalizado("REFUNDED")).toBe("ESTORNADO");
    expect(statusNormalizado("CRIANDO")).toBe("CRIANDO");
    expect(statusNormalizado("ERRO_EMISSAO")).toBe("FALHA");
    expect(statusNormalizado("DESCONHECIDO")).toBeNull();
    expect(statusIgnoradoNoSelo("REFUNDED")).toBe(true);
    expect(statusIgnoradoNoSelo("CRIANDO")).toBe(true);
    expect(statusIgnoradoNoSelo("ERRO_EMISSAO")).toBe(true);
    expect(statusIgnoradoNoSelo("PENDING")).toBe(false);
    expect(statusIgnoradoNoSelo("RECEIVED")).toBe(false);
  });

  it("traduz a fatura da Cora e não troca o mapa do Asaas", () => {
    expect(statusNormalizado("OPEN", "CORA")).toBe("PENDENTE");
    expect(statusNormalizado("LATE", "CORA")).toBe("VENCIDO");
    expect(statusNormalizado("PAID", "CORA")).toBe("PAGO");
    expect(statusNormalizado("CANCELLED", "CORA")).toBe("CANCELADO");
    expect(statusNormalizado("CANCELED", "CORA")).toBe("CANCELADO");
    expect(statusNormalizado("DRAFT", "CORA")).toBe("CRIANDO");
    expect(statusNormalizado("IN_PAYMENT", "CORA")).toBe("PENDENTE");
    expect(statusEh("OPEN", "REGUA_ABERTA", "CORA")).toBe(true);
    expect(statusEh("IN_PAYMENT", "REGUA_ABERTA", "CORA")).toBe(false);
    expect(statusEh("LATE", "RECORRENCIA_ABERTA", "CORA")).toBe(true);
    expect(statusEh("PAID", "REGUA_ABERTA", "CORA")).toBe(false);
    expect(statusBrutos("PAGO")).toEqual(HISTORICO.PAGO);
    expect(statusNormalizado("PENDING")).toBe("PENDENTE");
    expect(statusNormalizado("RECEIVED", "CORA")).toBeNull();
  });

  it("não muda o mapa do Asaas quando o status é do Inter", () => {
    expect(statusNormalizado("A_RECEBER")).toBe("PENDENTE");
    expect(statusNormalizado("PENDING")).toBe("PENDENTE");
    expect(statusBrutos("PENDENTE")).toEqual(HISTORICO.PENDENTE);
    expect(statusNormalizado("A_RECEBER", "ASAAS")).toBe("PENDENTE");
  });
});
