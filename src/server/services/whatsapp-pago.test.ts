import { describe, expect, it } from "vitest";
import { JANELA_WHATSAPP_PAGO_MS, pagamentoDentroDaJanelaWhatsapp } from "./whatsapp-pago";

const AGORA = new Date("2026-11-12T13:11:00.000Z");

describe("janela do WhatsApp de pago", () => {
  it("aceita o dia corrente e recusa um pagamento anterior a 24h", () => {
    expect(JANELA_WHATSAPP_PAGO_MS).toBe(24 * 60 * 60 * 1000);
    expect(pagamentoDentroDaJanelaWhatsapp({ clientPaymentDate: "2026-11-12" }, AGORA)).toBe(true);
    expect(pagamentoDentroDaJanelaWhatsapp({ paymentDate: "2026-11-12", clientPaymentDate: "" }, AGORA)).toBe(true);
    expect(pagamentoDentroDaJanelaWhatsapp({ clientPaymentDate: "2026-11-11" }, AGORA)).toBe(false);
    expect(pagamentoDentroDaJanelaWhatsapp({ paymentDate: "2026-11-10" }, AGORA)).toBe(false);
    expect(pagamentoDentroDaJanelaWhatsapp({}, AGORA)).toBe(true);
  });
});
