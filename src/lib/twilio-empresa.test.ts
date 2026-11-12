import { describe, expect, it } from "vitest";
import {
  criacaoSubcontaHabilitada,
  normalizarTelefoneTwilio,
  remetenteDoCanal,
  rotuloStatusNumeroTwilio,
  rotuloStatusSubconta,
  rotuloStatusTemplateWhatsapp,
  rotuloTipoTemplateWhatsapp,
} from "./twilio-empresa";

describe("telefone e status da subconta", () => {
  it("aceita E.164 e número brasileiro sem DDI", () => {
    expect(normalizarTelefoneTwilio("whatsapp:+1 (650) 476-2069")).toBe("+16504762069");
    expect(normalizarTelefoneTwilio("+5511988887777")).toBe("+5511988887777");
    expect(normalizarTelefoneTwilio("11988887777")).toBe("+5511988887777");
    expect(normalizarTelefoneTwilio("123")).toBeNull();
    expect(normalizarTelefoneTwilio("+012345678")).toBeNull();
  });

  it("mostra status em português e só liga a criação com true", () => {
    expect(rotuloStatusNumeroTwilio("CADASTRADO")).toBe("Cadastrado");
    expect(rotuloStatusNumeroTwilio("PENDENTE")).toBe("Pendente");
    expect(rotuloStatusNumeroTwilio("ATIVO")).toBe("Ativo");
    expect(rotuloStatusNumeroTwilio("INATIVO")).toBe("Inativo");
    expect(rotuloStatusSubconta("CONFIGURADA", true)).toBe("Configurada");
    expect(rotuloTipoTemplateWhatsapp("VENCE_HOJE")).toBe("Vence hoje");
    expect(rotuloStatusTemplateWhatsapp("APROVADO")).toBe("Aprovado");
    expect(rotuloStatusTemplateWhatsapp(null)).toBe("Não cadastrado");
    expect(rotuloStatusSubconta("CONFIGURADA", false)).toBe("Credencial ilegível");
    expect(criacaoSubcontaHabilitada({})).toBe(false);
    expect(criacaoSubcontaHabilitada({ TWILIO_CRIAR_SUBCONTA: "" })).toBe(false);
    expect(criacaoSubcontaHabilitada({ TWILIO_CRIAR_SUBCONTA: "false" })).toBe(false);
    expect(criacaoSubcontaHabilitada({ TWILIO_CRIAR_SUBCONTA: " TRUE " })).toBe(true);
    expect(remetenteDoCanal("WHATSAPP", "+5511988887777")).toBe("whatsapp:+5511988887777");
    expect(remetenteDoCanal("SMS", "+5511988887777")).toBe("+5511988887777");
  });
});
