import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { documentoDaFatura, MENSAGEM_FATURA_SEM_DOCUMENTO } from "@/lib/baixar-fatura";
import { AcoesCompartilhar } from "./acoes-compartilhar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

const base = {
  link: "https://sandbox.asaas.com/i/pay_1",
  whatsapp: "11999998888",
  email: "cliente@exemplo.test",
  cliente: "Padaria",
  servico: "Mensalidade",
  valor: "150.00",
  vencimento: "2026-11-10",
  modeloMensagem: "",
  modeloAssunto: "",
};

function html(props: Parameters<typeof AcoesCompartilhar>[0]) {
  return renderToStaticMarkup(createElement(AcoesCompartilhar, props));
}

describe("painel da fatura: baixar no lugar de copiar link", () => {
  it("mostra só Baixar fatura e mantém WhatsApp e e-mail com o link de pagamento", () => {
    const markup = html({
      ...base,
      baixar: documentoDaFatura({ boletoUrl: "https://sandbox.asaas.com/b/pdf/pay_1" }),
    });

    expect(markup).toContain("Baixar fatura");
    expect(markup).toContain('href="https://sandbox.asaas.com/b/pdf/pay_1"');
    expect(markup).toContain('download="fatura.pdf"');
    expect(markup).toContain("Enviar por WhatsApp");
    expect(markup).toContain("Enviar por e-mail");
    expect(markup).toContain("wa.me/");
    expect(markup).toContain("mailto:cliente@exemplo.test");
    expect(markup).not.toContain("Copiar link");
    expect(markup).not.toContain("Link copiado");
  });

  it("avisa em português quando não há documento, sem abrir um download quebrado", () => {
    const markup = html({ ...base, baixar: documentoDaFatura({ boletoUrl: null }) });

    expect(markup).toContain("Baixar fatura");
    expect(markup).toContain(MENSAGEM_FATURA_SEM_DOCUMENTO);
    expect(markup).toContain("disabled");
    expect(markup).not.toContain('download="fatura.pdf"');
    expect(markup).not.toContain("/b/pdf/");
    expect(markup).not.toContain("Copiar link");
    expect(markup).toContain("wa.me/");
  });

  it("baixa pela rota da aplicação sem navegar direto para ela", () => {
    const markup = html({
      ...base,
      baixar: documentoDaFatura({ boletoUrl: "/api/faturas/clh3fatura0123456789abcd/pdf" }),
    });

    expect(markup).toContain("Baixar fatura");
    expect(markup).not.toContain('href="/api/faturas/');
    expect(markup).not.toContain("Copiar link");
  });

  it("mantém Copiar link nas telas que não são o painel da fatura", () => {
    const markup = html(base);

    expect(markup).toContain("Copiar link");
    expect(markup).not.toContain("Baixar fatura");
  });

  it("no link do cartão o e-mail e o WhatsApp saem pelo servidor", () => {
    const markup = html({ ...base, envioCartao: { faturaId: "fatura-cartao-1" } });

    expect(markup).toContain("Copiar link");
    expect(markup).toContain("Enviar por WhatsApp");
    expect(markup).toContain("Enviar por e-mail");
    expect(markup).not.toContain("wa.me/");
    expect(markup).not.toContain("mailto:");
  });
});
