import { describe, expect, it } from "vitest";
import { confirmarBaixaManualHabilitado, faturaAceitaBaixaManual, valorBaixaDiverge } from "./baixa-manual";

const hoje = "2026-11-20";
const inicial = {
  pagoEm: hoje,
  valor: "350,00",
  forma: "",
  nota: "",
  enviarConfirmacao: false,
};

describe("formulário da baixa manual", () => {
  it("só confirma quando o formulário é válido e mudou", () => {
    expect(confirmarBaixaManualHabilitado(inicial, inicial, hoje)).toBe(false);
    expect(confirmarBaixaManualHabilitado({ ...inicial, forma: "PIX" }, inicial, hoje)).toBe(true);
    expect(
      confirmarBaixaManualHabilitado({ ...inicial, forma: "PIX", pagoEm: "2026-11-21" }, inicial, hoje),
    ).toBe(false);
    expect(confirmarBaixaManualHabilitado({ ...inicial, forma: "PIX", valor: "0,00" }, inicial, hoje)).toBe(false);
    expect(confirmarBaixaManualHabilitado({ ...inicial, forma: "PIX", nota: "pix na Cora" }, inicial, hoje)).toBe(true);
  });

  it("aceita fatura em aberto ou vencida de qualquer provedor e avisa valor diferente", () => {
    expect(faturaAceitaBaixaManual({ status: "PENDING", excluida: false, provedor: "ASAAS" })).toBe(true);
    expect(faturaAceitaBaixaManual({ status: "OVERDUE", excluida: false, provedor: "ASAAS" })).toBe(true);
    expect(faturaAceitaBaixaManual({ status: "LATE", excluida: false, provedor: "CORA" })).toBe(true);
    expect(faturaAceitaBaixaManual({ status: "EM_ABERTO", excluida: false, provedor: "PIX_DIRETO" })).toBe(true);
    expect(faturaAceitaBaixaManual({ status: "RECEIVED", excluida: false, provedor: "ASAAS" })).toBe(false);
    expect(faturaAceitaBaixaManual({ status: "PENDING", excluida: true, provedor: "ASAAS" })).toBe(false);
    expect(valorBaixaDiverge("300,00", "350.00")).toBe(true);
    expect(valorBaixaDiverge("350,00", "350.00")).toBe(false);
  });
});
