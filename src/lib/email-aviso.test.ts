import { describe, expect, it } from "vitest";
import { dadosAmostraAviso, montarEmailAviso, type DadosEmailAviso } from "./email-aviso";

const BASE: DadosEmailAviso = {
  empresa: "Padaria Azul",
  cliente: "Cantina da Praia",
  servico: "Licença mensal",
  valor: "R$ 150,00",
  vencimento: "10/11/2026",
  status: "Em aberto",
  link: "https://exemplo.test/fatura",
  linhaDigitavel: "23793.38128 60083.013528 56000.063307 7 89840000010000",
  pixCopiaCola: "00020126360014BR.GOV.BCB.PIX0114exemplo@pix.test",
  logoUrl: null,
  mensagem: "Olá, Cantina da Praia. Segue a cobrança de Licença mensal.",
  modoTeste: false,
};

describe("e-mail de aviso", () => {
  it("com logo monta o html e o texto", () => {
    const carta = montarEmailAviso({
      ...BASE,
      logoUrl: "https://cdn.exemplo.test/logos/padaria.png",
    });

    expect(carta.html).toContain("https://cdn.exemplo.test/logos/padaria.png");
    expect(carta.html).toContain('alt="Padaria Azul"');
    expect(carta.html).toContain("Olá, Cantina da Praia.");
    expect(carta.html).toContain("R$ 150,00");
    expect(carta.html).toContain("10/11/2026");
    expect(carta.html).toContain("Em aberto");
    expect(carta.html).toContain("Baixar fatura");
    expect(carta.html).toContain("https://exemplo.test/fatura");
    expect(carta.html).toContain("23793.38128");
    expect(carta.html).toContain("exemplo@pix.test");
    expect(carta.html).toContain("max-width:600px");
    expect(carta.html).toContain('role="presentation"');
    expect(carta.texto).toContain("Segue a cobrança de Licença mensal.");
    expect(carta.texto).toContain("Situação: Em aberto");
    expect(carta.texto).toContain("Linha digitável: 23793.38128");
    expect(carta.texto).not.toContain("Modo teste");
    expect(carta.html.split("Olá, Cantina da Praia.").length - 1).toBe(1);
  });

  it("sem logo usa o nome no cabeçalho e não coloca imagem", () => {
    const carta = montarEmailAviso(BASE);
    expect(carta.html).not.toContain("<img");
    expect(carta.html).toContain("font-size:22px");
    expect(carta.html).toContain("Padaria Azul");
  });

  it("omite botão, linha e pix quando não existem", () => {
    const carta = montarEmailAviso({
      ...BASE,
      link: "",
      linhaDigitavel: "  ",
      pixCopiaCola: null,
    });
    expect(carta.html).not.toContain("Baixar fatura");
    expect(carta.html).not.toContain("Linha digitável");
    expect(carta.html).not.toContain("Pix copia e cola");
    expect(carta.texto).not.toContain("Fatura:");
    expect(carta.texto).not.toContain("Linha digitável");
  });

  it("escapa html dos dados do cliente e recusa link perigoso", () => {
    const carta = montarEmailAviso({
      ...BASE,
      empresa: `Empresa <b onclick="alert(1)">ruim</b>`,
      cliente: `<script>alert("x")</script>`,
      status: `Em aberto"><img src=x onerror=alert(1)>`,
      linhaDigitavel: `"><script>alert(1)</script>`,
      pixCopiaCola: `abc&<def>`,
      link: "javascript:alert(1)",
      logoUrl: "javascript:alert(1)",
      mensagem: `Olá, <img src=x onerror=alert(1)>\nsegunda linha`,
    });

    expect(carta.html).not.toContain("<script");
    expect(carta.html).not.toContain("<b ");
    expect(carta.html).not.toContain("<img");
    expect(carta.html).not.toContain("javascript:");
    expect(carta.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(carta.html).toContain("Empresa &lt;b onclick=&quot;alert(1)&quot;&gt;ruim&lt;/b&gt;");
    expect(carta.html).toContain("abc&amp;&lt;def&gt;");
    expect(carta.html).toContain("segunda linha");
    expect(carta.html).not.toContain("Baixar fatura");
  });

  it("aceita a logo pública da própria aplicação e recusa outro caminho", () => {
    const id = "c123456789012345678901234";
    const com = montarEmailAviso({
      ...BASE,
      logoUrl: `/api/publico/logos/${id}?v=2026-11-11T12%3A00%3A00.000Z`,
    });
    const sem = montarEmailAviso({
      ...BASE,
      logoUrl: "/api/empresa/logo",
    });
    expect(com.html).toContain(`src="/api/publico/logos/${id}?v=2026-11-11T12%3A00%3A00.000Z"`);
    expect(sem.html).not.toContain("<img");
  });

  it("marca o modo teste sem trocar o começo do texto", () => {
    const carta = montarEmailAviso({ ...BASE, modoTeste: true });
    expect(carta.texto.startsWith("Modo teste: este e-mail foi enviado para você, não para o cliente.")).toBe(true);
    expect(carta.html).toContain("Modo teste: este e-mail foi enviado para você, não para o cliente.");
  });

  it("a amostra da régua traz situação em português e varia linha e pix", () => {
    const emissao = dadosAmostraAviso("emissao", "Empresa Exemplo");
    const vencimento = dadosAmostraAviso("vencimento", "Empresa Exemplo");
    const atraso = dadosAmostraAviso("atraso", "Empresa & Filhos");
    expect(emissao.status).toBe("Em aberto");
    expect(emissao.linhaDigitavel).toBeTruthy();
    expect(emissao.pixCopiaCola).toBeNull();
    expect(vencimento.pixCopiaCola).toBeTruthy();
    expect(vencimento.linhaDigitavel).toBeNull();
    expect(atraso.status).toBe("Vencida");
    const html = montarEmailAviso({ ...atraso, logoUrl: null, modoTeste: false }).html;
    expect(html).toContain("Vencida");
    expect(html).toContain("Empresa &amp; Filhos");
    expect(html).not.toContain("Empresa & Filhos");
    expect(html).not.toContain("<img");
  });
});
