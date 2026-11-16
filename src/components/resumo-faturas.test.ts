import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FaturaParaResumo } from "@/lib/resumo-faturas";
import { ResumoFaturas } from "./resumo-faturas";

function textos(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

describe("card de total das faturas", () => {
  it("mostra o total em reais da lista inteira, não só da primeira página", () => {
    const faturas: FaturaParaResumo[] = [
      ...Array.from({ length: 20 }, () => ({ valor: "10.00", status: "PENDING", excluida: false })),
      { valor: "1234.56", status: "RECEIVED", excluida: false },
      { valor: "0.10", status: "OVERDUE", excluida: false },
    ];
    const texto = textos(renderToStaticMarkup(createElement(ResumoFaturas, { faturas })));

    expect(texto).toContain("Total das faturas filtradas");
    expect(texto).toContain("R$ 1.434,66");
    expect(texto).toContain("22 faturas · soma de todas as páginas.");
    expect(texto).toContain("Em aberto");
    expect(texto).toContain("R$ 200,00");
    expect(texto).toContain("20 faturas");
    expect(texto).toContain("Pagas");
    expect(texto).toContain("R$ 1.234,56");
    expect(texto).toContain("Vencidas");
    expect(texto).toContain("R$ 0,10");
    expect(texto).toContain("Em aberto é o que ainda não venceu.");
  });

  it("mostra zero quando o filtro não encontra fatura", () => {
    const texto = textos(renderToStaticMarkup(createElement(ResumoFaturas, { faturas: [] })));

    expect(texto).toContain("R$ 0,00");
    expect(texto).toContain("Nenhuma fatura com estes filtros.");
    expect(texto).not.toContain("Em aberto");
    expect(texto).not.toContain("soma de todas as páginas");
  });

  it("usa o singular quando só há uma fatura", () => {
    const texto = textos(
      renderToStaticMarkup(createElement(ResumoFaturas, { faturas: [{ valor: "50.00", status: "OVERDUE", excluida: false }] })),
    );

    expect(texto).toContain("R$ 50,00");
    expect(texto).toContain("1 fatura · soma de todas as páginas.");
    expect(texto).toContain("Vencidas");
    expect(texto).not.toContain("Em aberto é o que ainda não venceu.");
  });
});
