import { describe, expect, it } from "vitest";
import { evolutionWhatsappHabilitada, instanciaEvolutionValida, nomeInstanciaDaEmpresa, provedorEfetivo } from "./selecao";

describe("seleção do provedor de WhatsApp", () => {
  it("mantém a Twilio sem flag ou sem escolha explícita", () => {
    expect(evolutionWhatsappHabilitada({})).toBe(false);
    expect(evolutionWhatsappHabilitada({ EVOLUTION_WHATSAPP_ENABLED: "false" })).toBe(false);
    expect(evolutionWhatsappHabilitada({ EVOLUTION_WHATSAPP_ENABLED: "true" })).toBe(true);
    expect(provedorEfetivo(false, "EVOLUTION")).toBe("TWILIO");
    expect(provedorEfetivo(true, null)).toBe("TWILIO");
    expect(provedorEfetivo(true, "TWILIO")).toBe("TWILIO");
    expect(provedorEfetivo(true, "EVOLUTION")).toBe("EVOLUTION");
  });

  it("deriva o nome da instância da empresa e recusa nome arbitrário", () => {
    const nome = nomeInstanciaDaEmpresa("EmpresaComId123456");
    expect(nome.startsWith("tg")).toBe(true);
    expect(instanciaEvolutionValida(nome)).toBe(true);
    expect(instanciaEvolutionValida("outra-empresa")).toBe(false);
    expect(instanciaEvolutionValida("../../etc")).toBe(false);
  });
});
