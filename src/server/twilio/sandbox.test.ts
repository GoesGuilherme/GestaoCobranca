import { afterEach, describe, expect, it } from "vitest";
import {
  contentSidSandbox,
  REMETENTE_OFICIAL_WHATSAPP,
  REMETENTE_SANDBOX_WHATSAPP,
  remetenteOficialTesteLigado,
  sandboxWhatsappLigado,
  usarRemetenteOficialTeste,
  usarSandboxWhatsapp,
} from "./sandbox";

const SID = `HX${"ab".repeat(16)}`;

afterEach(() => {
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_CONTENT_SID_PAGO;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
});

describe("sandbox de WhatsApp", () => {
  it("liga pela flag ou pelo remetente oficial, e ignora outro From", () => {
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_SANDBOX: "true" })).toBe(true);
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886" })).toBe(true);
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_FROM: "+14155238886" })).toBe(true);
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_SANDBOX: "false" })).toBe(false);
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_FROM: "whatsapp:+5511988887777" })).toBe(false);
    expect(REMETENTE_SANDBOX_WHATSAPP).toBe("whatsapp:+14155238886");
  });

  it("só vale no modo teste e só aceita ContentSid da conta pai", () => {
    expect(usarSandboxWhatsapp(true, { TWILIO_WHATSAPP_SANDBOX: "true" })).toBe(true);
    expect(usarSandboxWhatsapp(false, { TWILIO_WHATSAPP_SANDBOX: "true" })).toBe(false);
    expect(contentSidSandbox("PAGO", { TWILIO_CONTENT_SID_PAGO: SID })).toBe(SID);
    expect(contentSidSandbox("PAGO", { TWILIO_CONTENT_SID_PAGO: "HXcurto" })).toBeNull();
    expect(contentSidSandbox("OUTRO", { TWILIO_CONTENT_SID_PAGO: SID })).toBeNull();
  });

  it("o Sender oficial só liga com a flag exata e só no modo teste", () => {
    expect(REMETENTE_OFICIAL_WHATSAPP).toBe("whatsapp:+16504762069");
    expect(remetenteOficialTesteLigado({ TWILIO_WHATSAPP_SENDER_OFICIAL: "true" })).toBe(true);
    expect(remetenteOficialTesteLigado({ TWILIO_WHATSAPP_SENDER_OFICIAL: "false" })).toBe(false);
    expect(remetenteOficialTesteLigado({})).toBe(false);
    expect(usarRemetenteOficialTeste(true, { TWILIO_WHATSAPP_SENDER_OFICIAL: "true" })).toBe(true);
    expect(usarRemetenteOficialTeste(false, { TWILIO_WHATSAPP_SENDER_OFICIAL: "true" })).toBe(false);
    expect(sandboxWhatsappLigado({ TWILIO_WHATSAPP_SENDER_OFICIAL: "true" })).toBe(false);
  });
});
