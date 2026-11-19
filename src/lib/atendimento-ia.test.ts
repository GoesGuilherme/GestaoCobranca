import { describe, expect, it } from "vitest";
import {
  MODELO_IA_WHATSAPP_PADRAO,
  TEXTO_FORA_DO_COMBINADO,
  atendimentoIaAlterado,
  modeloAtendimentoIa,
  montarTextoClienteIa,
  textoLivreAtendimento,
  textoSeguroIa,
} from "./atendimento-ia";

describe("atendimento por IA", () => {
  it("só habilita salvar quando algum campo mudou", () => {
    const gravado = { ativo: false, instrucoes: "breve", textoRepasse: "" };
    expect(atendimentoIaAlterado(gravado, gravado)).toBe(false);
    expect(atendimentoIaAlterado({ ...gravado, ativo: true }, gravado)).toBe(true);
    expect(atendimentoIaAlterado({ ...gravado, instrucoes: "  breve  " }, gravado)).toBe(false);
    expect(atendimentoIaAlterado({ ...gravado, textoRepasse: "financeiro@empresa.test" }, gravado)).toBe(true);
  });

  it("ignora botão e usa o modelo do ambiente quando ele tem provedor", () => {
    expect(textoLivreAtendimento("Registrar promessa", "pp1_abc")).toBeNull();
    expect(textoLivreAtendimento("  quais faturas  ", "")).toBe("quais faturas");
    expect(modeloAtendimentoIa({ NODE_ENV: "test" })).toBe(MODELO_IA_WHATSAPP_PADRAO);
    expect(modeloAtendimentoIa({ NODE_ENV: "test", AI_WHATSAPP_MODEL: "spacexai/grok-4.5" })).toBe("spacexai/grok-4.5");
    expect(modeloAtendimentoIa({ NODE_ENV: "test", AI_WHATSAPP_MODEL: "grok" })).toBe(MODELO_IA_WHATSAPP_PADRAO);
  });

  it("recusa valor, link, Pix, desconto e nome de banco que a ferramenta não devolveu", () => {
    const base = ["Em aberto: R$ 150,00, vencimento 10/11/2026. Link: https://cobranca.exemplo.test/p/1"];
    expect(textoSeguroIa("Sua fatura é R$ 150,00. Link: https://cobranca.exemplo.test/p/1", base)).toContain("R$ 150,00");
    expect(textoSeguroIa("Posso fazer R$ 50,00 de desconto no Asaas.", base)).toBe(base[0]);
    expect(textoSeguroIa("O Pix é 00020126580014br.gov.bcb.pix0114financeiroteste", base)).toBe(base[0]);
    expect(textoSeguroIa("Te dou 10% de desconto.", [])).toBe(TEXTO_FORA_DO_COMBINADO);
  });

  it("a primeira resposta avisa que é assistente virtual e esconde o id", () => {
    const id = "clxyz1234567890abcdef";
    const texto = montarTextoClienteIa("Padaria", false, `Fatura ${id} de R$ 10,00`, [id]);
    expect(texto.startsWith("Sou um assistente virtual da Padaria.")).toBe(true);
    expect(texto.includes(id)).toBe(false);
    const segunda = montarTextoClienteIa("Padaria", true, "Segue o link.", []);
    expect(segunda.includes("assistente virtual")).toBe(false);
  });
});
