import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { linhaDoTempoDaFatura } from "@/lib/linha-tempo-fatura";
import type { ReguaParaProgresso } from "@/lib/regua-progresso";
import { LinhaDoTempoFatura } from "./linha-tempo-fatura";
import { LinhaDoTempoRegua } from "./linha-tempo-regua";

const reguas: ReguaParaProgresso[] = [
  {
    id: "padrao",
    padrao: true,
    nome: "Padrão",
    passos: [
      { id: "emissao", ordem: 0, naEmissao: true, dias: null, assunto: "Boleto emitido" },
      { id: "antes", ordem: 1, naEmissao: false, dias: -5, assunto: "Cinco antes", enviarWhatsapp: true },
      { id: "depois", ordem: 2, naEmissao: false, dias: 3, assunto: "Três depois" },
    ],
  },
];

function textosVisiveis(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

describe("ícones de canal na linha do tempo da fatura", () => {
  const linha = linhaDoTempoDaFatura({
    status: "PENDING",
    excluida: false,
    vencimento: "2026-11-20",
    hoje: "2026-11-01",
    modo: "PADRAO",
    reguas,
    envios: [
      { passoId: "emissao", canal: "EMAIL", status: "ENVIADO", criadoEm: "2026-11-01T20:23:00.000Z" },
      { passoId: "antes", canal: "EMAIL", status: "ENVIADO", criadoEm: "2026-10-30T15:00:00.000Z" },
      { passoId: "antes", canal: "WHATSAPP", status: "ENVIADO", criadoEm: "2026-10-30T18:30:00.000Z" },
      { passoId: "depois", canal: "EMAIL", status: "ENVIADO" },
    ],
  });
  const html = renderToStaticMarkup(createElement(LinhaDoTempoFatura, { linha }));
  const visivel = textosVisiveis(html);

  it("mostra o horário ao lado do ícone e esconde as palavras E-mail e WhatsApp", () => {
    expect(visivel).toContain("01/11/2026, 17:23");
    expect(visivel).toContain("30/10/2026, 12:00");
    expect(visivel).toContain("30/10/2026, 15:30");
    expect(visivel).toContain("Lembrete enviado");
    expect(visivel).not.toMatch(/E-mail|WhatsApp/);
    expect(html).toContain('aria-label="E-mail"');
    expect(html).toContain('title="E-mail"');
    expect(html).toContain('aria-label="WhatsApp"');
    expect(html).toContain('title="WhatsApp"');
    expect(html).toContain("lucide-mail");
    expect(html).toContain("M20.52 3.48");
    expect(html).toContain("inline-flex max-w-full items-center justify-center gap-1");
  });

  it("mantém data prevista, não enviado e o nome do canal só no resumo acessível", () => {
    const semHora = linhaDoTempoDaFatura({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: "2026-11-01",
      modo: "PADRAO",
      reguas,
    });
    const markup = renderToStaticMarkup(createElement(LinhaDoTempoFatura, { linha: semHora }));
    const texto = textosVisiveis(markup);
    expect(texto).toContain("Não enviado");
    expect(texto).toContain("15/11/2026");
    expect(texto).not.toMatch(/E-mail|WhatsApp/);
    expect(markup).toContain("Emissão da cobrança · E-mail · não enviado");
    expect(markup).toContain('aria-label="Régua de cobrança.');
  });

  it("mostra só o ícone quando o envio não tem horário", () => {
    expect(visivel).toContain("Cobrança enviada");
    expect(html).toContain('aria-label="E-mail"');
    const enviado = linha.marcadores.find((marco) => marco.titulo === "Cobrança enviada");
    expect(enviado?.envios).toEqual([{ canal: "email", quando: null }]);
    expect(visivel).not.toContain("E-mail");
  });
});

describe("ícones de canal na linha do tempo da régua", () => {
  it("usa os mesmos símbolos, com tooltip, sem badge de texto", () => {
    const html = renderToStaticMarkup(
      createElement(LinhaDoTempoRegua, {
        nome: "Régua teste",
        passos: [
          { naEmissao: true, dias: null, assunto: "Boleto emitido", enviarWhatsapp: false },
          { naEmissao: false, dias: -2, assunto: "Dois antes", enviarWhatsapp: true },
        ],
      }),
    );
    const visivel = textosVisiveis(html);
    expect(visivel).toContain("Cobrança emitida");
    expect(visivel).toContain("Lembrete antes do vencimento");
    expect(visivel).not.toMatch(/E-mail|WhatsApp/);
    expect(html.match(/aria-label="E-mail"/g)).toHaveLength(2);
    expect(html.match(/aria-label="WhatsApp"/g)).toHaveLength(1);
    expect(html.match(/title="E-mail"/g)).toHaveLength(2);
    expect(html.match(/title="WhatsApp"/g)).toHaveLength(1);
    expect(html).toContain("lucide-mail");
    expect(html).toContain("M20.52 3.48");
    expect(html).toContain("Emissão da cobrança · E-mail · Boleto emitido");
    expect(html).toContain("2 dias antes do vencimento · E-mail e WhatsApp · Dois antes");
  });
});
