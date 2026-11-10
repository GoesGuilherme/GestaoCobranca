import { describe, expect, it } from "vitest";
import { rotuloStatusFatura } from "./rotulos";
import { PROVEDORES_PAGAMENTO, STATUS_NORMALIZADO, statusBrutos, type StatusNormalizado } from "./status-pagamento";

const ROTULOS_DO_MAPA = new Set([
  "Em aberto",
  "Em análise",
  "Confirmada",
  "Recebida",
  "Recebida em dinheiro",
  "Vencida",
  "Em negativação",
  "Recebida após negativação",
  "Estornada",
  "Estorno pedido",
  "Estorno em andamento",
  "Chargeback",
  "Chargeback em disputa",
  "Aguardando reversão",
  "Cancelada",
  "Expirada",
  "Em emissão",
  "Falha na emissão",
  "Em protesto",
]);

const GRUPOS: StatusNormalizado[] = [
  STATUS_NORMALIZADO.CRIANDO,
  STATUS_NORMALIZADO.PENDENTE,
  STATUS_NORMALIZADO.VENCIDO,
  STATUS_NORMALIZADO.PAGO,
  STATUS_NORMALIZADO.CANCELADO,
  STATUS_NORMALIZADO.ESTORNADO,
  STATUS_NORMALIZADO.FALHA,
];

describe("rótulo do status da fatura", () => {
  it("mantém o vocabulário do Asaas", () => {
    expect(rotuloStatusFatura("PENDING", false)).toBe("Em aberto");
    expect(rotuloStatusFatura("pending", false)).toBe("Em aberto");
    expect(rotuloStatusFatura(" AWAITING_RISK_ANALYSIS ", false)).toBe("Em análise");
    expect(rotuloStatusFatura("CONFIRMED", false)).toBe("Confirmada");
    expect(rotuloStatusFatura("RECEIVED", false)).toBe("Recebida");
    expect(rotuloStatusFatura("RECEIVED_IN_CASH", false)).toBe("Recebida em dinheiro");
    expect(rotuloStatusFatura("OVERDUE", false)).toBe("Vencida");
    expect(rotuloStatusFatura("DUNNING_REQUESTED", false)).toBe("Em negativação");
    expect(rotuloStatusFatura("DUNNING_RECEIVED", false)).toBe("Recebida após negativação");
    expect(rotuloStatusFatura("REFUNDED", false)).toBe("Estornada");
    expect(rotuloStatusFatura("REFUND_REQUESTED", false)).toBe("Estorno pedido");
    expect(rotuloStatusFatura("REFUND_IN_PROGRESS", false)).toBe("Estorno em andamento");
    expect(rotuloStatusFatura("CHARGEBACK_REQUESTED", false)).toBe("Chargeback");
    expect(rotuloStatusFatura("CHARGEBACK_DISPUTE", false)).toBe("Chargeback em disputa");
    expect(rotuloStatusFatura("AWAITING_CHARGEBACK_REVERSAL", false)).toBe("Aguardando reversão");
    expect(rotuloStatusFatura("RECEIVED", true)).toBe("Cancelada");
  });

  it("traduz OPEN e os outros status crus da Cora para o mesmo rótulo", () => {
    expect(rotuloStatusFatura("OPEN", false)).toBe("Em aberto");
    expect(rotuloStatusFatura("open", false)).toBe("Em aberto");
    expect(rotuloStatusFatura("LATE", false)).toBe("Vencida");
    expect(rotuloStatusFatura("PAID", false)).toBe("Recebida");
    expect(rotuloStatusFatura("CANCELLED", false)).toBe("Cancelada");
    expect(rotuloStatusFatura("CANCELED", false)).toBe("Cancelada");
    expect(rotuloStatusFatura("IN_PAYMENT", false)).toBe("Em análise");
    expect(rotuloStatusFatura("DRAFT", false)).toBe("Em emissão");
    expect(rotuloStatusFatura("RECURRENCE_DRAFT", false)).toBe("Em emissão");
    expect(rotuloStatusFatura("OPEN", true)).toBe("Cancelada");
    expect(rotuloStatusFatura("PAID", true)).toBe("Cancelada");
  });

  it("não transforma fatura paga em Em aberto", () => {
    expect(rotuloStatusFatura("PAID", false)).not.toBe("Em aberto");
    expect(rotuloStatusFatura("RECEIVED", false)).toBe("Recebida");
    expect(rotuloStatusFatura("CONFIRMED", false)).toBe("Confirmada");
    expect(rotuloStatusFatura("RECEIVED_IN_CASH", false)).toBe("Recebida em dinheiro");
    expect(rotuloStatusFatura("DUNNING_RECEIVED", false)).toBe("Recebida após negativação");
  });

  it("mantém os rótulos que o Inter já usava", () => {
    expect(rotuloStatusFatura("A_RECEBER", false)).toBe("Em aberto");
    expect(rotuloStatusFatura("ATRASADO", false)).toBe("Vencida");
    expect(rotuloStatusFatura("RECEBIDO", false)).toBe("Recebida");
    expect(rotuloStatusFatura("MARCADO_RECEBIDO", false)).toBe("Recebida");
    expect(rotuloStatusFatura("CANCELADO", false)).toBe("Cancelada");
    expect(rotuloStatusFatura("EXPIRADO", false)).toBe("Expirada");
    expect(rotuloStatusFatura("EM_PROCESSAMENTO", false)).toBe("Em emissão");
    expect(rotuloStatusFatura("FALHA_EMISSAO", false)).toBe("Falha na emissão");
    expect(rotuloStatusFatura("PROTESTO", false)).toBe("Em protesto");
    expect(rotuloStatusFatura("CRIANDO", false)).toBe("Em emissão");
    expect(rotuloStatusFatura("ERRO_EMISSAO", false)).toBe("Falha na emissão");
  });

  it("nenhum status conhecido de provedor aparece como enum cru", () => {
    for (const provedor of PROVEDORES_PAGAMENTO) {
      for (const grupo of GRUPOS) {
        for (const bruto of statusBrutos(grupo, provedor)) {
          const rotulo = rotuloStatusFatura(bruto, false);
          expect(ROTULOS_DO_MAPA.has(rotulo), `${provedor} ${bruto} virou "${rotulo}"`).toBe(true);
          expect(rotulo).not.toBe(bruto);
        }
      }
    }
  });

  it("deixa texto desconhecido como veio, sem inventar rótulo", () => {
    expect(rotuloStatusFatura("DESCONHECIDO", false)).toBe("DESCONHECIDO");
    expect(rotuloStatusFatura("  ", false)).toBe("");
  });
});
