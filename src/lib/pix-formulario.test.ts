import { describe, expect, it } from "vitest";
import { completarCnpj } from "./documento";
import { PIX_VAZIO } from "./pix-chave";
import { confirmarBaixaHabilitado, salvarPixHabilitado } from "./pix-formulario";

const inicial = {
  ...PIX_VAZIO,
  tipoChave: "CNPJ",
  chavePix: completarCnpj("112223330001"),
  nomeRecebedor: "Padaria Central",
  cidadeRecebedor: "Santos",
  usarNasCobrancas: false,
};

describe("botão Salvar da chave Pix", () => {
  it("começa desligado e só liga com alteração válida", () => {
    expect(salvarPixHabilitado(PIX_VAZIO, PIX_VAZIO)).toBe(false);
    expect(salvarPixHabilitado(inicial, inicial)).toBe(false);
    expect(salvarPixHabilitado({ ...inicial, cidadeRecebedor: "S" }, inicial)).toBe(false);
    expect(salvarPixHabilitado({ ...inicial, cidadeRecebedor: "Santos " }, inicial)).toBe(false);
    expect(salvarPixHabilitado({ ...inicial, usarNasCobrancas: true }, inicial)).toBe(true);
    expect(salvarPixHabilitado({ ...inicial, nomeRecebedor: "Padaria Nova" }, inicial)).toBe(true);
  });

  it("a baixa manual só confirma com data válida e o aceite marcado", () => {
    expect(confirmarBaixaHabilitado("2026-11-13", false, "2026-11-13")).toBe(false);
    expect(confirmarBaixaHabilitado("2026-11-14", true, "2026-11-13")).toBe(false);
    expect(confirmarBaixaHabilitado("31/11/2026", true, "2026-11-13")).toBe(false);
    expect(confirmarBaixaHabilitado("2026-11-13", true, "2026-11-13")).toBe(true);
    expect(confirmarBaixaHabilitado("2026-11-01", true, "2026-11-13")).toBe(true);
  });
});
