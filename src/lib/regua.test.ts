import { describe, expect, it } from "vitest";
import {
  AMOSTRA_REGUA,
  assuntoRegua,
  dentroDaJanela,
  diasAtraso,
  passoCombina,
  rotuloAtribuicao,
  rotuloPasso,
  textoRegua,
} from "./regua";

describe("texto da régua", () => {
  it("troca cliente, serviço, valor, vencimento, link, atraso e empresa", () => {
    const texto = textoRegua(
      "Olá, {cliente}. A {empresa} cobra {servico} de {valor}, vencimento {vencimento}, atraso {dias_atraso}. {link}",
      { ...AMOSTRA_REGUA, empresa: "Empresa Exemplo" },
    );
    expect(texto).toBe(
      "Olá, Cliente exemplo. A Empresa Exemplo cobra Serviço exemplo de R$ 150,00, vencimento 26/10/2026, atraso 3. https://exemplo.test/cobranca",
    );
  });

  it("prefixa o assunto só no modo teste", () => {
    expect(assuntoRegua("Sua cobrança vence hoje", false)).toBe("Sua cobrança vence hoje");
    expect(assuntoRegua("Sua cobrança vence hoje", true)).toBe("[Teste] Sua cobrança vence hoje");
    expect(assuntoRegua("[Teste] Já marcado", true)).toBe("[Teste] Já marcado");
  });

  it("nomeia o passo e a régua do cliente", () => {
    expect(rotuloPasso({ naEmissao: true, dias: null })).toBe("Na emissão");
    expect(rotuloPasso({ naEmissao: false, dias: -5 })).toBe("5 dias antes");
    expect(rotuloPasso({ naEmissao: false, dias: -1 })).toBe("1 dia antes");
    expect(rotuloPasso({ naEmissao: false, dias: 0 })).toBe("No vencimento");
    expect(rotuloPasso({ naEmissao: false, dias: 7 })).toBe("7 dias de atraso");
    expect(rotuloAtribuicao({ pausada: false, nome: "Padrão" })).toBe("Régua: Padrão");
    expect(rotuloAtribuicao({ pausada: true, nome: "Clientes VIP" })).toBe("Régua pausada · Clientes VIP");
    expect(rotuloAtribuicao({ pausada: false, nome: null })).toBe("Sem régua");
  });

  it("não envia no fim de semana e recupera o alvo na segunda", () => {
    expect(passoCombina("2026-10-24", "2026-10-24", false)).toBe(false);
    expect(passoCombina("2026-10-25", "2026-10-25", false)).toBe(false);
    expect(passoCombina("2026-10-26", "2026-10-24", false)).toBe(true);
    expect(passoCombina("2026-10-26", "2026-10-25", false)).toBe(true);
    expect(passoCombina("2026-10-26", "2026-10-23", false)).toBe(false);
    expect(passoCombina("2026-10-26", "2026-10-26", false)).toBe(true);
    expect(passoCombina("2026-10-24", "2026-10-24", true)).toBe(true);
    expect(dentroDaJanela(12, 8, 18)).toBe(true);
    expect(dentroDaJanela(8, 8, 18)).toBe(true);
    expect(dentroDaJanela(18, 8, 18)).toBe(false);
    expect(diasAtraso("2026-10-29", "2026-10-26")).toBe(3);
    expect(diasAtraso("2026-10-26", "2026-10-29")).toBe(0);
  });
});
