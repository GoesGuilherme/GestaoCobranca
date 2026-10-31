import { describe, expect, it } from "vitest";
import {
  mascararCnpjDigitando,
  mascararDocumentoDigitando,
  mascararMoedaDigitando,
  mascararTelefoneDigitando,
} from "./mascaras";

describe("máscara de telefone", () => {
  it("formata celular e fixo conforme a pessoa digita", () => {
    expect(mascararTelefoneDigitando("13")).toBe("(13");
    expect(mascararTelefoneDigitando("13988881001")).toBe("(13) 98888-1001");
    expect(mascararTelefoneDigitando("(13) 98888-1001")).toBe("(13) 98888-1001");
    expect(mascararTelefoneDigitando("1333331001")).toBe("(13) 3333-1001");
  });

  it("preserva um número internacional que já começa com +", () => {
    expect(mascararTelefoneDigitando("+55 13 98888-1001")).toBe("+55 13 98888-1001");
  });
});

describe("máscara de documento", () => {
  it("aplica CPF enquanto há até 11 dígitos e CNPJ depois", () => {
    expect(mascararDocumentoDigitando("52998224725")).toBe("529.982.247-25");
    expect(mascararDocumentoDigitando("529.982.247-25")).toBe("529.982.247-25");
    expect(mascararDocumentoDigitando("529982")).toBe("529.982");
    expect(mascararDocumentoDigitando("00000000000191")).toBe("00.000.000/0001-91");
  });

  it("aceita CNPJ alfanumérico", () => {
    expect(mascararCnpjDigitando("ab12cd34ef0120")).toBe("AB.12C.D34/EF01-20");
    expect(mascararDocumentoDigitando("ab.12c.d34/ef01-20")).toBe("AB.12C.D34/EF01-20");
  });
});

describe("máscara de moeda", () => {
  it("agrupa milhares e preserva a vírgula decimal", () => {
    expect(mascararMoedaDigitando("189,90")).toBe("189,90");
    expect(mascararMoedaDigitando("1899")).toBe("1.899");
    expect(mascararMoedaDigitando("R$ 1.899,90")).toBe("1.899,90");
    expect(mascararMoedaDigitando("189.90")).toBe("189,90");
    expect(mascararMoedaDigitando("1.899")).toBe("1.899");
    expect(mascararMoedaDigitando("")).toBe("");
    expect(mascararMoedaDigitando(",")).toBe("0,");
  });
});
