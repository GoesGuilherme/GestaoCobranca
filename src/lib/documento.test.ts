import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  completarCnpj,
  completarCpf,
  cpfValido,
  formatarCnpj,
  formatarCpf,
  formatarWhatsapp,
  identificarDocumento,
  whatsappValido,
} from "./documento";

describe("CPF", () => {
  it("aceita um CPF válido com ou sem máscara", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(completarCpf("529982247")).toBe("52998224725");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });

  it("rejeita dígitos repetidos e verificador errado", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido com ou sem máscara", () => {
    const cnpj = completarCnpj("000000000001");
    expect(cnpj).toBe("00000000000191");
    expect(cnpjValido(cnpj)).toBe(true);
    expect(cnpjValido(formatarCnpj(cnpj))).toBe(true);
    expect(formatarCnpj(cnpj)).toBe("00.000.000/0001-91");
  });

  it("aceita o CNPJ alfanumérico e rejeita dígito trocado", () => {
    const cnpj = completarCnpj("ab12cd34ef01");
    expect(cnpj).toBe("AB12CD34EF0120");
    expect(cnpjValido("ab.12c.d34/ef01-20")).toBe(true);
    expect(cnpjValido("AB12CD34EF0121")).toBe(false);
  });

  it("rejeita sequência repetida e tamanho errado", () => {
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("00.000.000/0001-00")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });
});

describe("identificação e WhatsApp", () => {
  it("distingue CPF de CNPJ", () => {
    expect(identificarDocumento("529.982.247-25")?.tipo).toBe("CPF");
    expect(identificarDocumento("00.000.000/0001-91")?.tipo).toBe("CNPJ");
    expect(identificarDocumento("documento invalido")).toBeNull();
  });

  it("valida e formata telefone com DDD", () => {
    expect(whatsappValido("(13) 98888-1001")).toBe(true);
    expect(whatsappValido("1333331001")).toBe(true);
    expect(whatsappValido("988881001")).toBe(false);
    expect(whatsappValido("13")).toBe(false);
    expect(formatarWhatsapp("13988881001")).toBe("(13) 98888-1001");
  });
});
