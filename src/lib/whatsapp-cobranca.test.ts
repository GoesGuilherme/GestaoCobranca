import { describe, expect, it } from "vitest";
import {
  TEMPLATES_COBRANCA_WHATSAPP,
  decisaoOptOut,
  tipoTemplateDoPasso,
  variaveisDoTemplate,
  whatsappE164,
} from "./whatsapp-cobranca";

describe("templates de cobrança", () => {
  it("são UTILITY com nome, valor, vencimento e link, e o X só no lembrete de dias", () => {
    expect(TEMPLATES_COBRANCA_WHATSAPP.map((item) => item.tipo)).toEqual([
      "BOLETO_GERADO",
      "VENCE_EM_DIAS",
      "VENCEU",
      "PAGO",
    ]);
    for (const template of TEMPLATES_COBRANCA_WHATSAPP) {
      expect(template.corpo.startsWith("{{")).toBe(false);
      expect(template.corpo.endsWith("}}")).toBe(false);
      expect(template.corpo).toContain("{{1}}");
      expect(template.corpo).toContain("{{2}}");
      expect(template.corpo).toContain("{{3}}");
      expect(template.corpo).toContain("{{4}}");
      expect(template.nome.startsWith("taguaro_")).toBe(true);
    }
    expect(TEMPLATES_COBRANCA_WHATSAPP[1]?.corpo).toContain("{{5}}");
    expect(TEMPLATES_COBRANCA_WHATSAPP[0]?.corpo).not.toContain("{{5}}");
  });

  it("escolhe o template pelo passo e exige link http", () => {
    expect(tipoTemplateDoPasso({ naEmissao: true, dias: null })).toBe("BOLETO_GERADO");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: -5 })).toBe("VENCE_EM_DIAS");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: 0 })).toBe("VENCE_EM_DIAS");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: 3 })).toBe("VENCEU");
    expect(
      variaveisDoTemplate("VENCE_EM_DIAS", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "https://www.asaas.com/i/abc",
        dias: "5",
      }),
    ).toMatchObject({ "1": "Ana", "5": "5" });
    expect(
      variaveisDoTemplate("PAGO", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "",
      }),
    ).toBeNull();
  });

  it("normaliza o telefone e lê o opt-out", () => {
    expect(whatsappE164("(13) 98888-1001")).toBe("+5513988881001");
    expect(whatsappE164("+55 13 98888-1001")).toBe("+5513988881001");
    expect(decisaoOptOut({ corpo: "parar", optOutType: "" })).toBe("PARAR");
    expect(decisaoOptOut({ corpo: "oi", optOutType: "STOP" })).toBe("PARAR");
    expect(decisaoOptOut({ corpo: "RETOMAR", optOutType: "" })).toBe("RETOMAR");
    expect(decisaoOptOut({ corpo: "qual o valor?", optOutType: "" })).toBeNull();
  });
});
