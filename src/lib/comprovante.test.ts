import { describe, expect, it } from "vitest";
import {
  alertasDoComprovante,
  escolherFaturaDoComprovante,
  EXTRACAO_VAZIA,
  recebedorConfere,
} from "./comprovante";

const empresa = {
  nomeFantasia: "Collab Software",
  razaoSocial: "Collab Software Ltda",
  cnpj: "11222333000181",
  chavePix: "financeiro@collab.test",
};

const fatura = {
  id: "fat-1",
  valor: "350.00",
  vencimento: "2026-11-10",
  criadoEm: "2026-11-01T12:00:00.000Z",
  status: "OVERDUE",
  excluida: false,
  provedor: "ASAAS",
};

describe("conferência de comprovante", () => {
  it("casa valor e data e aponta divergências sem liquidar", () => {
    const escolha = escolherFaturaDoComprovante(
      [fatura, { ...fatura, id: "fat-2", valor: "90.00", vencimento: "2026-11-20" }],
      { valor: "350.00", pagoEm: "2026-11-12" },
    );
    expect(escolha).toEqual({ faturaId: "fat-1", valorDiverge: false });
    const alertas = alertasDoComprovante({
      extraido: {
        ...EXTRACAO_VAZIA,
        parece: true,
        valor: "350.00",
        pagoEm: "2026-10-01",
        recebedorNome: "Outra Empresa",
        e2e: "E2E1",
      },
      empresa,
      fatura: { valor: "350.00", criadoEm: fatura.criadoEm },
      valorDiverge: false,
      e2eDuplicado: true,
      hashUsado: false,
    });
    expect(alertas).toEqual(["recebedor_divergente", "e2e_duplicado", "data_anterior_a_fatura"]);
    expect(recebedorConfere({ ...EXTRACAO_VAZIA, recebedorChave: "financeiro@collab.test" }, empresa)).toBe(true);
  });
});
