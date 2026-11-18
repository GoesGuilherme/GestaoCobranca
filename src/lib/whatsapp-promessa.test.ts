import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));
import { readFileSync } from "node:fs";
import { FormularioPrazoPromessa } from "@/components/formulario-prazo-promessa";
import { TEMPLATES_COBRANCA_WHATSAPP } from "./whatsapp-cobranca";
import {
  EXEMPLO_TOKEN_PROMESSA,
  TEMPLATES_PROMESSA_PROPOSTOS,
  TITULO_BOTAO_PROMESSA,
  TITULO_BOTAO_PROMESSA_PEDIDO,
  classificarDataPromessa,
  conteudoTwilioProposto,
  corpoVisivelPromessa,
  dataDaOpcao,
  interpretarRespostaPromessa,
  salvarPrazoPromessaHabilitado,
  templatesPromessaForaDaPublicacao,
  textoConfirmacaoPromessa,
  tokenPromessaValido,
  variaveisDoTemplatePromessa,
} from "./whatsapp-promessa";

const HOJE = "2026-11-18";

describe("modelos propostos da promessa", () => {
  it("fica fora da publicação e leva o botão ao lado do link", () => {
    expect(templatesPromessaForaDaPublicacao()).toBe(true);
    expect(TEMPLATES_PROMESSA_PROPOSTOS.map((item) => item.tipo)).not.toContain("PAGO");
    expect(TITULO_BOTAO_PROMESSA_PEDIDO).toBe("Quero registrar uma promessa de pagamento");
    expect(TITULO_BOTAO_PROMESSA.length).toBeLessThanOrEqual(20);
    for (const modelo of TEMPLATES_PROMESSA_PROPOSTOS) {
      expect(modelo.nome.endsWith("_v3")).toBe(true);
      expect(modelo.corpo).toContain("Acesse o link do Asaas:");
      expect(modelo.corpo).toContain("Para registrar uma promessa de pagamento, toque no botão.");
      expect(modelo.corpo.endsWith("Qualquer dúvida, responda esta mensagem.")).toBe(true);
      expect(modelo.tituloBotao).toBe(TITULO_BOTAO_PROMESSA);
      const conteudo = conteudoTwilioProposto(modelo.tipo);
      expect(conteudo.types["twilio/quick-reply"].actions).toEqual([
        { title: TITULO_BOTAO_PROMESSA, id: `{{${modelo.variavelBotao}}}` },
      ]);
      expect(conteudo.variables[modelo.variavelBotao]).toBe(EXEMPLO_TOKEN_PROMESSA);
      expect(EXEMPLO_TOKEN_PROMESSA.includes("fatura")).toBe(false);
    }
    expect(TEMPLATES_COBRANCA_WHATSAPP.some((item) => item.nome.includes("_v3"))).toBe(false);
  });

  it("grava o token opaco na variável do botão", () => {
    const token = EXEMPLO_TOKEN_PROMESSA;
    const variaveis = variaveisDoTemplatePromessa("BOLETO_GERADO", {
      nome: "Maria",
      valor: "R$ 10,00",
      vencimento: "20/11/2026",
      link: "https://exemplo.test/cobranca",
      token,
    });
    expect(variaveis?.["5"]).toBe(token);
    expect(variaveis?.["4"]).toBe("https://exemplo.test/cobranca");
    expect(variaveisDoTemplatePromessa("VENCE_EM_DIAS", {
      nome: "Maria",
      valor: "R$ 10,00",
      vencimento: "20/11/2026",
      link: "https://exemplo.test/cobranca",
      dias: "3",
      token: "clh123fatura",
    })).toBeNull();
  });

  it("não mostra o token na conversa monitorada", () => {
    expect(corpoVisivelPromessa("", EXEMPLO_TOKEN_PROMESSA)).toBe(TITULO_BOTAO_PROMESSA_PEDIDO);
    expect(corpoVisivelPromessa(EXEMPLO_TOKEN_PROMESSA, null)).toBe(TITULO_BOTAO_PROMESSA_PEDIDO);
    expect(corpoVisivelPromessa("Amanhã", null)).toBe("Amanhã");
    expect(tokenPromessaValido(EXEMPLO_TOKEN_PROMESSA)).toBe(true);
  });
});

describe("datas da promessa no chat", () => {
  it("entende as opções, o dia digitado e o teto", () => {
    expect(dataDaOpcao("amanha", HOJE)).toBe("2026-11-19");
    expect(dataDaOpcao("3", HOJE)).toBe("2026-11-21");
    expect(dataDaOpcao("7", HOJE)).toBe("2026-11-25");
    expect(interpretarRespostaPromessa("Amanhã", null, HOJE)).toEqual({ tipo: "opcao", opcao: "amanha" });
    expect(interpretarRespostaPromessa("", "ppdata:7", HOJE)).toEqual({ tipo: "opcao", opcao: "7" });
    expect(interpretarRespostaPromessa("Outra data", null, HOJE)).toEqual({ tipo: "opcao", opcao: "outra" });
    expect(interpretarRespostaPromessa("20/11", null, HOJE)).toEqual({ tipo: "data", iso: "2026-11-20" });
    expect(interpretarRespostaPromessa("20/11/2026", null, HOJE)).toEqual({ tipo: "data", iso: "2026-11-20" });
    expect(interpretarRespostaPromessa("01/11", null, HOJE)).toEqual({ tipo: "data", iso: "2027-11-01" });
    expect(interpretarRespostaPromessa("31/02", null, HOJE).tipo).toBe("invalida");
    expect(classificarDataPromessa("2026-12-03", HOJE, 15)).toBe("ok");
    expect(classificarDataPromessa("2026-12-04", HOJE, 15)).toBe("longe");
    expect(classificarDataPromessa("2026-11-17", HOJE, 15)).toBe("passada");
    expect(textoConfirmacaoPromessa("R$ 150,00", "2026-11-20")).toBe("Anotado: pagamento de R$ 150,00 até 20/11");
  });

  it("só habilita Salvar quando o prazo mudou e continua válido", () => {
    expect(salvarPrazoPromessaHabilitado("15", 15)).toBe(false);
    expect(salvarPrazoPromessaHabilitado("16", 15)).toBe(true);
    expect(salvarPrazoPromessaHabilitado("0", 15)).toBe(false);
    expect(salvarPrazoPromessaHabilitado("91", 15)).toBe(false);
    expect(salvarPrazoPromessaHabilitado("abc", 15)).toBe(false);
    const html = renderToStaticMarkup(createElement(FormularioPrazoPromessa, { prazoDias: 15 }));
    expect(html).toContain(">Salvar<");
    expect(html).toContain("disabled");
    expect(html).toContain("Prazo máximo em dias");
  });

  it("a migration só acrescenta origem, prazo, token e conversa", () => {
    const sql = readFileSync("prisma/migrations/20261118020000_promessa_whatsapp/migration.sql", "utf8");
    expect(sql).toContain("CREATE TYPE \"origem_promessa\"");
    expect(sql).toContain("prazo_maximo_promessa_dias");
    expect(sql).toContain("tokens_promessa_whatsapp");
    expect(sql).toContain("conversas_promessa_whatsapp");
    expect(sql).toContain("DROP NOT NULL");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DROP COLUMN");
  });
});
