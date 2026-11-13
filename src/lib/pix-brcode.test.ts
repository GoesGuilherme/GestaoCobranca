import { describe, expect, it } from "vitest";
import { brCodeValido, crc16Ccitt, montarBrCode, textoEmv, valorEmv } from "./pix-brcode";

describe("BR Code Pix", () => {
  it("calcula o CRC16/CCITT-FALSE do vetor conhecido", () => {
    expect(crc16Ccitt("123456789")).toBe("29B1");
  });

  it("monta o payload estático com chave, valor, txid e CRC", () => {
    const payload = montarBrCode({
      chave: "financeiro@empresa.test",
      nomeRecebedor: "João da Padaria",
      cidadeRecebedor: "São Paulo",
      valor: "150.00",
      txid: "abc123txid",
      descricao: "Mensalidade",
    });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("financeiro@empresa.test");
    expect(payload).toContain("5406150.00");
    expect(payload).toContain("JOAO DA PADARIA");
    expect(payload).toContain("SAO PAULO");
    expect(payload).toContain("abc123txid");
    expect(brCodeValido(payload)).toBe(true);
    expect(crc16Ccitt(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it("omite o valor zero e corta nome e cidade no limite do Banco Central", () => {
    const payload = montarBrCode({
      chave: "123e4567-e89b-12d3-a456-426655440000",
      nomeRecebedor: "Nome muito comprido para o campo do recebedor",
      cidadeRecebedor: "Cidade comprida demais",
      valor: "0.00",
      txid: "txidcurto1",
    });
    expect(payload).not.toContain("5404");
    expect(payload).toContain("NOME MUITO COMPRIDO PARA");
    expect(textoEmv("Nome muito comprido para o campo do recebedor", 25)).toHaveLength(25);
    expect(textoEmv("Cidade comprida demais", 15)).toHaveLength(15);
    expect(valorEmv("0.00")).toBeNull();
    expect(valorEmv("010.50")).toBe("10.50");
    expect(brCodeValido(payload)).toBe(true);
  });

  it("recusa txid e nome que não cabem no EMV", () => {
    expect(() =>
      montarBrCode({
        chave: "a@b.co",
        nomeRecebedor: "***",
        cidadeRecebedor: "Santos",
        valor: "10.00",
        txid: "ok",
      }),
    ).toThrow(/nome ou cidade/i);
    expect(() =>
      montarBrCode({
        chave: "a@b.co",
        nomeRecebedor: "Loja",
        cidadeRecebedor: "Santos",
        valor: "10.00",
        txid: "com espaço",
      }),
    ).toThrow(/txid/i);
  });
});
