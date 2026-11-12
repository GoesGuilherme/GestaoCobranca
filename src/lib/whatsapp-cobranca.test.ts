import { describe, expect, it } from "vitest";
import {
  TEMPLATES_COBRANCA_WHATSAPP,
  decisaoOptOut,
  diasDoTemplateEmissao,
  formaUsaTemplateBoleto,
  tipoTemplateDoPasso,
  tipoWhatsappDaEmissao,
  variaveisCompativeisComTemplate,
  variaveisDoTemplate,
  whatsappE164,
} from "./whatsapp-cobranca";

const FECHO = "Qualquer dúvida, responda esta mensagem.";

function placeholdersEmOrdem(corpo: string): string[] {
  return [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((item) => item[1] ?? "");
}

describe("templates de cobrança", () => {
  it("são UTILITY com texto fixo depois da última variável e nomes novos", () => {
    expect(TEMPLATES_COBRANCA_WHATSAPP.map((item) => item.tipo)).toEqual([
      "BOLETO_GERADO",
      "VENCE_EM_DIAS",
      "VENCEU",
      "PAGO",
    ]);
    expect(TEMPLATES_COBRANCA_WHATSAPP.map((item) => item.nome)).toEqual([
      "taguaro_boleto_gerado_v2",
      "taguaro_vence_em_dias_v2",
      "taguaro_venceu_v2",
      "taguaro_pago_v2",
    ]);
    for (const template of TEMPLATES_COBRANCA_WHATSAPP) {
      expect(template.corpo.startsWith("Olá, ")).toBe(true);
      expect(template.corpo.endsWith(FECHO)).toBe(true);
      expect(template.corpo).not.toMatch(/\{\{\d+\}\}\s*[.!?]\s*$/);
      const numeros = placeholdersEmOrdem(template.corpo);
      expect(numeros).toEqual(numeros.map((_, indice) => String(indice + 1)));
      expect(Object.keys(template.variaveisExemplo)).toEqual(numeros);
      const depois = template.corpo.slice(template.corpo.lastIndexOf("}}") + 2);
      expect(depois).toMatch(/[A-Za-zÀ-ÿ]/);
    }
    expect(TEMPLATES_COBRANCA_WHATSAPP[0]?.corpo).toBe(
      `Olá, {{1}}. Seu boleto de {{2}}, com vencimento em {{3}}, foi gerado. Acesse o link do Asaas: {{4}}. ${FECHO}`,
    );
    expect(TEMPLATES_COBRANCA_WHATSAPP[1]?.corpo).toBe(
      `Olá, {{1}}. Sua cobrança de {{2}} vence em {{3}} dias, na data {{4}}. Acesse o link do Asaas: {{5}}. ${FECHO}`,
    );
    expect(TEMPLATES_COBRANCA_WHATSAPP[2]?.corpo).toBe(
      `Olá, {{1}}. A cobrança de {{2}}, com vencimento em {{3}}, está em atraso. Acesse o link do Asaas: {{4}}. ${FECHO}`,
    );
    expect(TEMPLATES_COBRANCA_WHATSAPP[3]?.corpo).toBe(
      `Olá, {{1}}. Confirmamos o pagamento de {{2}} da cobrança com vencimento em {{3}}. O link do Asaas é {{4}}. ${FECHO}`,
    );
    expect(TEMPLATES_COBRANCA_WHATSAPP[1]?.variaveisExemplo).toEqual({
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "5",
      "4": "30/10/2026",
      "5": "https://www.asaas.com/i/exemplo",
    });
  });

  it("escolhe o template pelo passo e exige link http", () => {
    expect(formaUsaTemplateBoleto("BOLETO")).toBe(true);
    expect(formaUsaTemplateBoleto("boleto_pix")).toBe(true);
    expect(formaUsaTemplateBoleto("PIX")).toBe(false);
    expect(formaUsaTemplateBoleto("CREDIT_CARD")).toBe(false);
    expect(formaUsaTemplateBoleto("UNDEFINED")).toBe(false);
    expect(formaUsaTemplateBoleto("")).toBe(false);
    expect(formaUsaTemplateBoleto(null)).toBe(false);
    expect(TEMPLATES_COBRANCA_WHATSAPP.find((item) => item.tipo === "BOLETO_GERADO")?.corpo).toContain("boleto");
    expect(tipoTemplateDoPasso({ naEmissao: true, dias: null })).toBe("BOLETO_GERADO");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: -5 })).toBe("VENCE_EM_DIAS");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: 0 })).toBe("VENCE_EM_DIAS");
    expect(tipoTemplateDoPasso({ naEmissao: false, dias: 3 })).toBe("VENCEU");
    expect(tipoWhatsappDaEmissao("BOLETO", "2026-11-15", "2026-11-11")).toBe("BOLETO_GERADO");
    expect(tipoWhatsappDaEmissao("PIX", "2026-11-15", "2026-11-11")).toBeNull();
    expect(tipoWhatsappDaEmissao("UNDEFINED", "2026-11-15", "2026-11-11")).toBeNull();
    expect(tipoWhatsappDaEmissao("CREDIT_CARD", "2026-11-15", "2026-11-11")).toBe("VENCE_EM_DIAS");
    expect(tipoWhatsappDaEmissao("CREDIT_CARD", "2026-11-11", "2026-11-11")).toBe("VENCE_EM_DIAS");
    expect(tipoWhatsappDaEmissao("CREDIT_CARD", "2026-11-10", "2026-11-11")).toBe("VENCEU");
    expect(tipoWhatsappDaEmissao("CREDIT_CARD", "", "2026-11-11")).toBeNull();
    expect(diasDoTemplateEmissao("2026-11-15", "2026-11-11")).toBe(4);
    expect(diasDoTemplateEmissao("2026-11-11", "2026-11-11")).toBe(0);
    expect(diasDoTemplateEmissao("2026-11-10", "2026-11-11")).toBe(1);
    expect(
      variaveisDoTemplate("VENCE_EM_DIAS", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "https://www.asaas.com/i/abc",
        dias: "5",
      }),
    ).toEqual({
      "1": "Ana",
      "2": "R$ 10,00",
      "3": "5",
      "4": "30/10/2026",
      "5": "https://www.asaas.com/i/abc",
    });
    expect(
      variaveisDoTemplate("BOLETO_GERADO", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "https://www.asaas.com/i/abc",
      }),
    ).toEqual({
      "1": "Ana",
      "2": "R$ 10,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/abc",
    });
    expect(
      variaveisDoTemplate("VENCE_EM_DIAS", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "https://www.asaas.com/i/abc",
        dias: "",
      }),
    ).toBeNull();
    expect(
      variaveisDoTemplate("PAGO", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "",
      }),
    ).toBeNull();
    const vence = variaveisDoTemplate("VENCE_EM_DIAS", {
      nome: "Ana",
      valor: "R$ 10,00",
      vencimento: "30/10/2026",
      link: "https://www.asaas.com/i/abc",
      dias: "5",
    });
    const boleto = variaveisDoTemplate("BOLETO_GERADO", {
      nome: "Ana",
      valor: "R$ 10,00",
      vencimento: "30/10/2026",
      link: "https://www.asaas.com/i/abc",
    });
    expect(vence && variaveisCompativeisComTemplate("VENCE_EM_DIAS", vence)).toBe(true);
    expect(boleto && variaveisCompativeisComTemplate("BOLETO_GERADO", boleto)).toBe(true);
    expect(boleto && variaveisCompativeisComTemplate("VENCEU", boleto)).toBe(true);
    expect(boleto && variaveisCompativeisComTemplate("PAGO", boleto)).toBe(true);
    expect(boleto && variaveisCompativeisComTemplate("VENCE_HOJE", boleto)).toBe(true);
    expect(
      variaveisDoTemplate("VENCE_HOJE", {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "30/10/2026",
        link: "https://www.asaas.com/i/abc",
        dias: "0",
      }),
    ).toEqual({
      "1": "Ana",
      "2": "R$ 10,00",
      "3": "30/10/2026",
      "4": "https://www.asaas.com/i/abc",
    });
    expect(
      variaveisCompativeisComTemplate("VENCE_EM_DIAS", {
        "1": "Ana",
        "2": "R$ 10,00",
        "3": "30/10/2026",
        "4": "https://www.asaas.com/i/abc",
        "5": "5",
      }),
    ).toBe(false);
    expect(boleto && variaveisCompativeisComTemplate("VENCE_EM_DIAS", boleto)).toBe(false);
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
