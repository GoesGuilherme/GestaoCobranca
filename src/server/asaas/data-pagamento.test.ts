import { describe, expect, it } from "vitest";
import { dataPagamentoAsaas } from "./data-pagamento";

describe("data de pagamento do Asaas", () => {
  it("prefere o dia em que o cliente pagou e aceita data com hora", () => {
    expect(
      dataPagamentoAsaas({
        clientPaymentDate: "2026-11-09",
        paymentDate: "2026-11-12",
        confirmedDate: "2026-11-13",
      }),
    ).toBe("2026-11-09");
    expect(dataPagamentoAsaas({ paymentDate: "2026-11-12 14:32:00", confirmedDate: "2026-11-13" })).toBe("2026-11-12");
    expect(dataPagamentoAsaas({ confirmedDate: "2026-11-13T18:00:00Z" })).toBe("2026-11-13");
    expect(dataPagamentoAsaas({ clientPaymentDate: "amanha", paymentDate: "" })).toBeNull();
    expect(dataPagamentoAsaas({})).toBeNull();
  });
});
