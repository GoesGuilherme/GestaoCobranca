import { describe, expect, it } from "vitest";
import { motivoForaDaSelecaoBoleto, textoResultadoReenvio } from "./reenvio-boleto";
import type { ItemReenvioBoleto } from "./tipos";

const boleto = {
  formaCobranca: "BOLETO",
  boletoUrl: "https://exemplo.test/boleto",
  excluida: false,
  status: "PENDING",
};

describe("seleção de boleto para reenvio", () => {
  it("libera boleto e boleto com pix em aberto", () => {
    expect(motivoForaDaSelecaoBoleto(boleto)).toBeNull();
    expect(motivoForaDaSelecaoBoleto({ ...boleto, formaCobranca: "BOLETO_PIX", status: "OVERDUE" })).toBeNull();
    expect(motivoForaDaSelecaoBoleto({ ...boleto, status: "A_RECEBER" })).toBeNull();
  });

  it("bloqueia pix, cartão, sem link, paga e cancelada", () => {
    expect(motivoForaDaSelecaoBoleto({ ...boleto, formaCobranca: "PIX" })).toBe("Não é boleto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, formaCobranca: "CREDIT_CARD" })).toBe("Não é boleto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, formaCobranca: "UNDEFINED" })).toBe("Não é boleto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, boletoUrl: "  " })).toBe("Sem boleto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, boletoUrl: null })).toBe("Sem boleto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, status: "RECEIVED" })).toBe("Não está em aberto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, status: "CANCELADO", provedor: "INTER" })).toBe("Não está em aberto");
    expect(motivoForaDaSelecaoBoleto({ ...boleto, excluida: true })).toBe("Cancelada");
  });
});

describe("texto do resultado", () => {
  it("não chama aceito de entrega", () => {
    const itens: ItemReenvioBoleto[] = [
      {
        id: "1",
        nomeCliente: "Padaria",
        email: "aceito",
        emailMotivo: null,
        whatsapp: "aceito",
        whatsappMotivo: null,
      },
      {
        id: "2",
        nomeCliente: "Mercado",
        email: "ignorado",
        emailMotivo: "Não é boleto",
        whatsapp: "ja_existia",
        whatsappMotivo: "Já aceito antes. Não enviamos de novo.",
      },
    ];
    const texto = textoResultadoReenvio(itens);
    expect(texto.resumo).toContain("1 e-mail aceito");
    expect(texto.resumo).toContain("1 e-mail ignorado");
    expect(texto.resumo).toContain("1 aceito pela Twilio");
    expect(texto.resumo).toContain("1 já estava na fila");
    expect(texto.resumo.toLowerCase()).not.toContain("entreg");
    expect(texto.resumo).toContain("Não confirma que a mensagem chegou");
    expect(texto.detalhes).toEqual(["Mercado: E-mail: Não é boleto. WhatsApp: Já aceito antes. Não enviamos de novo."]);
  });
});
