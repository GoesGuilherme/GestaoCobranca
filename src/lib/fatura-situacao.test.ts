import { describe, expect, it } from "vitest";
import { faturaNaSituacao, faturaNaVisualizacao, faturasNaSituacao, faturasNaVisualizacao, tomFatura } from "./fatura-situacao";
import { filtroVisualizacao } from "./rotulos";

const aberta = { status: "PENDING", excluida: false, vencimento: "2026-11-10", atualizadoEm: "2026-10-01T12:00:00.000Z" };
const vencida = { status: "OVERDUE", excluida: false, vencimento: "2026-10-20", atualizadoEm: "2026-10-20T12:00:00.000Z" };
const paga = { status: "RECEIVED", excluida: false, vencimento: "2026-10-05", atualizadoEm: "2026-10-18T12:00:00.000Z" };
const pagaAntes = { status: "CONFIRMED", excluida: false, vencimento: "2026-09-01", atualizadoEm: "2026-09-02T12:00:00.000Z" };
const cancelada = { status: "PENDING", excluida: true, vencimento: "2026-10-01", atualizadoEm: "2026-10-22T12:00:00.000Z" };

describe("situação da fatura", () => {
  it("em aberto inclui vencida e deixa paga e cancelada de fora", () => {
    expect(faturaNaSituacao(aberta, "em_aberto")).toBe(true);
    expect(faturaNaSituacao(vencida, "em_aberto")).toBe(true);
    expect(faturaNaSituacao(paga, "em_aberto")).toBe(false);
    expect(faturaNaSituacao(cancelada, "em_aberto")).toBe(false);
    expect(faturaNaSituacao(cancelada, "canceladas")).toBe(true);
    expect(faturaNaSituacao(vencida, "vencidas")).toBe(true);
  });

  it("ordena em aberto pelo vencimento e pagas pela atualização", () => {
    const abertas = faturasNaSituacao([vencida, aberta, paga], "em_aberto");
    expect(abertas.map((fatura) => fatura.vencimento)).toEqual(["2026-10-20", "2026-11-10"]);
    const pagas = faturasNaSituacao([pagaAntes, paga], "pagas");
    expect(pagas.map((fatura) => fatura.atualizadoEm)).toEqual([
      "2026-10-18T12:00:00.000Z",
      "2026-09-02T12:00:00.000Z",
    ]);
  });

  it("separa faturas visualizadas das que o cliente ainda não abriu", () => {
    const vista = { visualizada: true, nome: "vista" };
    const nova = { visualizada: false, nome: "nova" };
    expect(faturaNaVisualizacao(vista, "vistas")).toBe(true);
    expect(faturaNaVisualizacao(nova, "vistas")).toBe(false);
    expect(faturaNaVisualizacao(nova, "nao_vistas")).toBe(true);
    expect(faturaNaVisualizacao(vista, "nao_vistas")).toBe(false);
    expect(faturasNaVisualizacao([vista, nova], "todas").map((fatura) => fatura.nome)).toEqual(["vista", "nova"]);
    expect(faturasNaVisualizacao([vista, nova], "vistas").map((fatura) => fatura.nome)).toEqual(["vista"]);
    expect(faturasNaVisualizacao([vista, nova], "nao_vistas").map((fatura) => fatura.nome)).toEqual(["nova"]);
    expect(filtroVisualizacao("vistas")).toBe("vistas");
    expect(filtroVisualizacao("nao_vistas")).toBe("nao_vistas");
    expect(filtroVisualizacao(undefined)).toBe("todas");
    expect(filtroVisualizacao("ontem")).toBe("todas");
  });

  it("escolhe a cor do selo", () => {
    expect(tomFatura("PENDING", false)).toBe("aberto");
    expect(tomFatura("OVERDUE", false)).toBe("vencida");
    expect(tomFatura("RECEIVED", false)).toBe("paga");
    expect(tomFatura("PENDING", true)).toBe("cancelada");
    expect(tomFatura("CHARGEBACK_REQUESTED", false)).toBe("estorno");
    expect(tomFatura("REFUNDED", false)).toBe("estorno");
  });
});
