import { describe, expect, it } from "vitest";
import { completarCnpj, completarCpf } from "./documento";
import { normalizarChavePix } from "./pix-chave";

describe("chave Pix própria", () => {
  it("normaliza CPF, CNPJ, e-mail, telefone e EVP", () => {
    const cpf = completarCpf("529982247");
    const cnpj = completarCnpj("112223330001");
    expect(normalizarChavePix("CPF", cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"))).toEqual({
      ok: true,
      tipo: "CPF",
      chave: cpf,
    });
    expect(normalizarChavePix("CNPJ", cnpj)).toMatchObject({ ok: true, chave: cnpj });
    expect(normalizarChavePix("EMAIL", " Financeiro@Empresa.TEST ")).toEqual({
      ok: true,
      tipo: "EMAIL",
      chave: "financeiro@empresa.test",
    });
    expect(normalizarChavePix("TELEFONE", "(13) 98888-1001")).toEqual({
      ok: true,
      tipo: "TELEFONE",
      chave: "+5513988881001",
    });
    expect(normalizarChavePix("EVP", "123E4567-E89B-12D3-A456-426655440000")).toEqual({
      ok: true,
      tipo: "EVP",
      chave: "123e4567-e89b-12d3-a456-426655440000",
    });
  });

  it("recusa chave que não bate com o tipo", () => {
    expect(normalizarChavePix("CPF", "123")).toMatchObject({ ok: false });
    expect(normalizarChavePix("EMAIL", "sem-arroba")).toMatchObject({ ok: false });
    expect(normalizarChavePix("TELEFONE", "123")).toMatchObject({ ok: false });
    expect(normalizarChavePix("EVP", "nao-e-uuid")).toMatchObject({ ok: false });
    expect(normalizarChavePix("OUTRO", "1")).toMatchObject({ ok: false });
  });
});
