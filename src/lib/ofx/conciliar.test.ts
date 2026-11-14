import { describe, expect, it } from "vitest";
import { completarCpf } from "@/lib/documento";
import {
  conciliarExtrato,
  decidirCredito,
  whereFaturasPixAbertas,
  type CreditoConciliavel,
  type FaturaParaConciliar,
} from "./conciliar";
import { confirmarOfxHabilitado, importarOfxHabilitado } from "./formulario";
import { LIMITE_OFX_BYTES } from "./limite";

const cpf = completarCpf("529982247");
const txid = "a1b2c3d4e5f60718293a4b5c6";

function fatura(parcial: Partial<FaturaParaConciliar> & Pick<FaturaParaConciliar, "id" | "valor">): FaturaParaConciliar {
  return {
    txid: null,
    emissao: "2026-11-01",
    nomeFantasia: "Padaria Exemplo",
    razaoSocial: "Padaria Exemplo Ltda",
    documento: cpf,
    ...parcial,
  };
}

function credito(parcial: Partial<CreditoConciliavel> & Pick<CreditoConciliavel, "valor">): CreditoConciliavel {
  return {
    fitId: "FIT-1",
    data: "2026-11-10",
    memo: "",
    nome: "",
    ...parcial,
  };
}

describe("conciliação OFX", () => {
  it("baixa no txid único mesmo com outra cobrança do mesmo valor", () => {
    const faturas = [
      fatura({ id: "f1", valor: "150.00", txid }),
      fatura({ id: "f2", valor: "150.00", txid: "bbbbbbbbbbbbbbbbbbbbbbbbb", nomeFantasia: "Outra Loja" }),
    ];
    expect(decidirCredito(credito({ valor: "150.00", memo: `PIX ${txid}` }), faturas)).toEqual({
      tipo: "automatico",
      faturaId: "f1",
    });
  });

  it("baixa por CPF ou nome quando a data é a da emissão ou posterior e o valor é único", () => {
    const unica = [fatura({ id: "f1", valor: "80.00" })];
    expect(decidirCredito(credito({ valor: "80.00", memo: "529.982.247-25" }), unica)).toEqual({
      tipo: "automatico",
      faturaId: "f1",
    });
    expect(decidirCredito(credito({ valor: "80.00", nome: "Padaria Exemplo Ltda" }), unica)).toEqual({
      tipo: "automatico",
      faturaId: "f1",
    });
    expect(decidirCredito(credito({ valor: "80.00", data: "2026-10-01", nome: "Padaria Exemplo" }), unica).tipo).toBe(
      "sugestao",
    );
  });

  it("trata valor sozinho, nome parcial e mais de uma candidata como sugestão", () => {
    const faturas = [
      fatura({ id: "f1", valor: "200.00" }),
      fatura({ id: "f2", valor: "200.00", nomeFantasia: "Mercado Central", razaoSocial: "Mercado Central Ltda", documento: completarCpf("390533447") }),
    ];
    expect(decidirCredito(credito({ valor: "200.00" }), faturas)).toEqual({
      tipo: "sugestao",
      faturaIds: ["f1", "f2"],
    });
    const soValor = [fatura({ id: "f1", valor: "200.00" })];
    expect(decidirCredito(credito({ valor: "200.00", memo: "TED SEM NOME" }), soValor)).toEqual({
      tipo: "sugestao",
      faturaIds: ["f1"],
    });
    expect(decidirCredito(credito({ valor: "200.00", nome: "Padaria" }), soValor).tipo).toBe("sugestao");
  });

  it("deixa sem ação o crédito que não acha cobrança", () => {
    expect(decidirCredito(credito({ valor: "15.00", nome: "Padaria Exemplo" }), [fatura({ id: "f1", valor: "16.00" })])).toEqual({
      tipo: "nao_identificado",
    });
  });

  it("não deixa dois créditos baixarem a mesma fatura", () => {
    const faturas = [fatura({ id: "f1", valor: "90.00", txid })];
    const decisoes = conciliarExtrato(
      [
        credito({ valor: "90.00", fitId: "A", memo: txid }),
        credito({ valor: "90.00", fitId: "B", memo: txid }),
      ],
      faturas,
    );
    expect(decisoes[0]).toEqual({ tipo: "automatico", faturaId: "f1" });
    expect(decisoes[1]).toEqual({ tipo: "nao_identificado" });
  });

  it("reavalia a sugestão depois que outro crédito leva uma das faturas", () => {
    const faturas = [
      fatura({ id: "f1", valor: "50.00", txid, nomeFantasia: "Alfa Comercio", razaoSocial: "Alfa Comercio Ltda", documento: completarCpf("153509460") }),
      fatura({ id: "f2", valor: "50.00" }),
    ];
    const decisoes = conciliarExtrato(
      [
        credito({ valor: "50.00", fitId: "S", nome: "Padaria Exemplo" }),
        credito({ valor: "50.00", fitId: "T", memo: txid }),
      ],
      faturas,
    );
    expect(decisoes[1]).toEqual({ tipo: "automatico", faturaId: "f1" });
    expect(decisoes[0]).toEqual({ tipo: "automatico", faturaId: "f2" });
  });

  it("restringe a busca à empresa", () => {
    expect(whereFaturasPixAbertas("emp-1")).toEqual({
      empresaId: "emp-1",
      provedor: "PIX_DIRETO",
      excluida: false,
      status: { in: ["EM_ABERTO", "VENCIDA"] },
    });
  });
});

describe("botões da conciliação", () => {
  it("só habilita importar com um .ofx dentro do limite", () => {
    expect(importarOfxHabilitado(null)).toBe(false);
    expect(importarOfxHabilitado({ nome: "extrato.csv", tamanho: 10 })).toBe(false);
    expect(importarOfxHabilitado({ nome: "extrato.ofx", tamanho: 0 })).toBe(false);
    expect(importarOfxHabilitado({ nome: "Extrato.OFX", tamanho: 20 })).toBe(true);
    expect(importarOfxHabilitado({ nome: "extrato.ofx", tamanho: LIMITE_OFX_BYTES + 1 })).toBe(false);
  });

  it("só habilita confirmar quando há uma cobrança ou uma escolha", () => {
    expect(confirmarOfxHabilitado(1, "")).toBe(true);
    expect(confirmarOfxHabilitado(2, "")).toBe(false);
    expect(confirmarOfxHabilitado(2, "fatura-1")).toBe(true);
  });
});
