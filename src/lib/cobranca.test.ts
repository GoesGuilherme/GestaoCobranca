import { describe, expect, it } from "vitest";
import {
  bandeiraCartaoSegura,
  descreverCobranca,
  finalCartaoSeguro,
  linkEmail,
  linkWhatsapp,
  mesDaCobranca,
  MODELO_ASSUNTO_PADRAO,
  MODELO_MENSAGEM_PADRAO,
  textoCobranca,
} from "./cobranca";
import { esquemaAtivarRecorrencia, esquemaPreferenciasCobranca } from "./validacao";

describe("descrição da cobrança", () => {
  it("troca os marcadores do modelo da empresa", () => {
    expect(mesDaCobranca("2026-11-10")).toBe("novembro de 2026");
    expect(
      descreverCobranca("Mensalidade {servico} de {cliente} em {mes}", {
        servico: "Licença mensal",
        cliente: "Cantina da Praia",
        vencimento: "2026-11-10",
      }),
    ).toBe("Mensalidade Licença mensal de Cantina da Praia em novembro de 2026");
  });

  it("usa o modelo genérico quando o texto vem vazio e deixa marcador desconhecido", () => {
    expect(
      descreverCobranca("  ", {
        servico: "Suporte",
        cliente: "Mercado",
        vencimento: "2026-02-28",
      }),
    ).toBe("Mensalidade Suporte");
    expect(
      descreverCobranca("{outro}", {
        servico: "Suporte",
        cliente: "Mercado",
        vencimento: "2026-02-28",
      }),
    ).toBe("{outro}");
  });

  it("deixa dia e percentuais ausentes para a preferência da empresa entrar", () => {
    const lido = esquemaAtivarRecorrencia.parse({});
    expect(lido.diaVencimento).toBeUndefined();
    expect(lido.multaPercentual).toBeUndefined();
    expect(lido.descontoPercentual).toBeUndefined();
    expect(esquemaAtivarRecorrencia.parse({ multaPercentual: "" }).multaPercentual).toBeNull();
    expect(esquemaAtivarRecorrencia.parse({ multaPercentual: "0" }).multaPercentual).toBe("0.00");
  });

  it("guarda só os quatro últimos dígitos e recusa o número completo", () => {
    expect(finalCartaoSeguro("8829")).toBe("8829");
    expect(finalCartaoSeguro("**** 8829")).toBe("8829");
    expect(finalCartaoSeguro("4111111111118829")).toBeNull();
    expect(finalCartaoSeguro(4111)).toBeNull();
    expect(bandeiraCartaoSegura("visa")).toBe("VISA");
    expect(bandeiraCartaoSegura("VISA 4111111111118829")).toBeNull();
  });

  it("monta a mensagem da empresa e os links de WhatsApp e e-mail", () => {
    const texto = textoCobranca(MODELO_MENSAGEM_PADRAO, MODELO_MENSAGEM_PADRAO, {
      cliente: "Cantina",
      servico: "Licença mensal",
      valor: "R$ 150,00",
      vencimento: "10/11/2026",
      link: "https://sandbox.asaas.com/i/pay_1",
    });
    expect(texto).toContain("Cantina");
    expect(texto).toContain("https://sandbox.asaas.com/i/pay_1");
    expect(texto).not.toContain("{cliente}");
    const whatsapp = linkWhatsapp("(13) 98888-1001", texto);
    expect(whatsapp).toBe(`https://wa.me/5513988881001?text=${encodeURIComponent(texto)}`);
    expect(linkWhatsapp("5513988881001", "oi")).toBe("https://wa.me/5513988881001?text=oi");
    expect(linkWhatsapp("123", "oi")).toBeNull();
    const email = linkEmail("ana@exemplo.test", textoCobranca(MODELO_ASSUNTO_PADRAO, MODELO_ASSUNTO_PADRAO, {
      cliente: "Cantina",
      servico: "Licença mensal",
      valor: "R$ 150,00",
      vencimento: "10/11/2026",
      link: "https://sandbox.asaas.com/i/pay_1",
    }), texto);
    expect(email?.startsWith("mailto:ana@exemplo.test?subject=")).toBe(true);
    expect(email).toContain(encodeURIComponent("Cobrança de Cantina"));
    const lidas = esquemaPreferenciasCobranca.parse({
      formaCobranca: "BOLETO",
      diaVencimento: 10,
      modeloDescricao: "Mensalidade {servico}",
      multaPercentual: null,
      jurosPercentual: null,
      descontoPercentual: null,
      descontoDiasAntes: null,
      diasAntesGerar: null,
      atualizarPendentes: false,
    });
    expect(lidas.modeloMensagem).toBe(MODELO_MENSAGEM_PADRAO);
    expect(lidas.modeloAssunto).toBe(MODELO_ASSUNTO_PADRAO);
  });
});
