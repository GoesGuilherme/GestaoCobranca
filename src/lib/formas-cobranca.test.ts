import { describe, expect, it } from "vitest";
import {
  escolherRota,
  FILTROS_FORMA,
  idFormaPadrao,
  lerFiltroForma,
  listarOpcoesCobranca,
  rotuloCobranca,
  ROTULO_PIX_DIRETO,
} from "./formas-cobranca";

const nenhuma = { pixDireto: false, asaas: false, cora: false, inter: false };

describe("opções de cobrança por configuração da empresa", () => {
  it("não lista banco que a empresa não conectou", () => {
    expect(listarOpcoesCobranca(nenhuma)).toEqual([]);
    expect(listarOpcoesCobranca({ ...nenhuma, pixDireto: true }).map((item) => item.rotulo)).toEqual([
      ROTULO_PIX_DIRETO,
    ]);
  });

  it("lista só o que cada cliente emite", () => {
    const rotulos = listarOpcoesCobranca({ pixDireto: true, asaas: true, cora: true, inter: true }).map(
      (item) => item.rotulo,
    );
    expect(rotulos).toEqual([
      "PIX direto (da empresa)",
      "Pix (Asaas)",
      "Boleto (Asaas)",
      "Cartão de crédito (Asaas)",
      "Cliente escolhe (Asaas)",
      "Boleto + Pix (Cora)",
      "Boleto + Pix (Inter)",
    ]);
    expect(rotulos.join(" ")).not.toMatch(/Efí|Sicoob|Sicredi/);
  });

  it("Asaas sem Pix da empresa não oferece PIX direto", () => {
    const ids = listarOpcoesCobranca({ ...nenhuma, asaas: true }).map((item) => item.id);
    expect(ids).toEqual(["ASAAS:PIX", "ASAAS:BOLETO", "ASAAS:CREDIT_CARD", "ASAAS:UNDEFINED"]);
  });

  it("Cora e Inter entram com a forma única que o cliente envia", () => {
    expect(listarOpcoesCobranca({ ...nenhuma, cora: true })).toEqual([
      { id: "CORA:BOLETO_PIX", provedor: "CORA", forma: "BOLETO", rotulo: "Boleto + Pix (Cora)" },
    ]);
    expect(listarOpcoesCobranca({ ...nenhuma, inter: true })[0]).toMatchObject({
      id: "INTER:BOLETO_PIX",
      provedor: "INTER",
      forma: "BOLETO",
    });
  });
});

describe("forma padrão e rótulo", () => {
  it("PIX_DIRETO continua a forma padrão mesmo se a preferência antiga for boleto", () => {
    expect(idFormaPadrao("PIX_DIRETO", "BOLETO")).toBe("PIX_DIRETO");
    expect(rotuloCobranca("PIX_DIRETO", "PIX")).toBe(ROTULO_PIX_DIRETO);
    expect(rotuloCobranca("ASAAS", "PIX")).toBe("Pix (Asaas)");
    expect(rotuloCobranca("CORA", "BOLETO")).toBe("Boleto + Pix (Cora)");
    expect(rotuloCobranca("INTER", "BOLETO")).toBe("Boleto + Pix (Inter)");
  });

  it("o filtro antigo por forma continua válido e o novo separa o provedor", () => {
    expect(lerFiltroForma("PIX")).toEqual({ forma: "PIX", provedor: null });
    expect(lerFiltroForma("PIX_DIRETO")).toEqual({ forma: "PIX", provedor: "PIX_DIRETO" });
    expect(lerFiltroForma("ASAAS:BOLETO")).toEqual({ forma: "BOLETO", provedor: "ASAAS" });
    expect(lerFiltroForma("DINHEIRO")).toEqual({ forma: null, provedor: null });
    expect(FILTROS_FORMA.map((item) => item.rotulo)).toContain(ROTULO_PIX_DIRETO);
  });
});

describe("rota da emissão", () => {
  const opcoes = listarOpcoesCobranca({ pixDireto: true, asaas: true, cora: true, inter: false });

  it("sem provedor no pedido, segue o padrão da empresa", () => {
    expect(
      escolherRota({
        provedorEmpresa: "PIX_DIRETO",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toEqual({ provedor: "PIX_DIRETO", forma: "PIX" });
    expect(
      escolherRota({
        provedorEmpresa: "ASAAS",
        formaInformada: "CREDIT_CARD",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toEqual({ provedor: "ASAAS", forma: "CREDIT_CARD" });
  });

  it("com provedor no pedido, ignora o padrão da empresa", () => {
    expect(
      escolherRota({
        provedorInformado: "ASAAS",
        formaInformada: "BOLETO",
        provedorEmpresa: "PIX_DIRETO",
        formaPadrao: "PIX",
        opcoes,
      }),
    ).toEqual({ provedor: "ASAAS", forma: "BOLETO" });
    expect(
      escolherRota({
        provedorInformado: "PIX_DIRETO",
        formaInformada: "PIX",
        provedorEmpresa: "ASAAS",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toEqual({ provedor: "PIX_DIRETO", forma: "PIX" });
    expect(
      escolherRota({
        provedorInformado: "CORA",
        formaInformada: "BOLETO",
        provedorEmpresa: "PIX_DIRETO",
        formaPadrao: "PIX",
        opcoes,
      }),
    ).toEqual({ provedor: "CORA", forma: "BOLETO" });
  });

  it("recusa forma que o cliente não emite e provedor desligado", () => {
    expect(
      escolherRota({
        provedorInformado: "CORA",
        formaInformada: "CREDIT_CARD",
        provedorEmpresa: "ASAAS",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toBeNull();
    expect(
      escolherRota({
        provedorInformado: "INTER",
        formaInformada: "BOLETO",
        provedorEmpresa: "ASAAS",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toBeNull();
    expect(
      escolherRota({
        provedorInformado: "EFI",
        formaInformada: "BOLETO",
        provedorEmpresa: "ASAAS",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toBeNull();
    expect(
      escolherRota({
        provedorEmpresa: "EFI",
        formaPadrao: "BOLETO",
        opcoes,
      }),
    ).toBeNull();
    expect(
      escolherRota({
        provedorEmpresa: "PIX_DIRETO",
        formaInformada: "BOLETO",
        formaPadrao: "PIX",
        opcoes,
      }),
    ).toBeNull();
  });
});
