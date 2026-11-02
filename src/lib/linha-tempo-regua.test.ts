import { describe, expect, it } from "vitest";
import {
  COR_FASE_LINHA_TEMPO,
  VERDE_LINHA_TEMPO,
  marcadoresDaLinhaTempo,
  nomeAcaoLinhaTempo,
  textoOffsetMarcador,
  type PassoLinhaTempo,
} from "./linha-tempo-regua";

function passo(parcial: Partial<PassoLinhaTempo> & Pick<PassoLinhaTempo, "naEmissao" | "dias">): PassoLinhaTempo {
  return {
    assunto: "Modelo",
    enviarWhatsapp: false,
    ...parcial,
  };
}

describe("marcadores da linha do tempo", () => {
  it("usa o azul da emissão, um verde só e o dourado do depois", () => {
    expect(COR_FASE_LINHA_TEMPO.emissao.marca).toBe("#0E3A6B");
    expect(COR_FASE_LINHA_TEMPO.depois.marca).toBe("#D4A02C");
    expect(COR_FASE_LINHA_TEMPO.antes.marca).toBe(VERDE_LINHA_TEMPO);
    expect(COR_FASE_LINHA_TEMPO.noDia.marca).toBe(VERDE_LINHA_TEMPO);
    expect(COR_FASE_LINHA_TEMPO.pago.marca).toBe(VERDE_LINHA_TEMPO);
    expect(VERDE_LINHA_TEMPO).toBe("#146c43");
  });

  it("nomeia a ação de cada fase", () => {
    expect(nomeAcaoLinhaTempo("emissao")).toBe("Boleto emitido");
    expect(nomeAcaoLinhaTempo("antes")).toBe("Lembrete antes do vencimento");
    expect(nomeAcaoLinhaTempo("noDia")).toBe("Aviso no dia do vencimento");
    expect(nomeAcaoLinhaTempo("depois")).toBe("Cobrança após vencimento");
    expect(nomeAcaoLinhaTempo("pago")).toBe("Pago");
  });

  it("formata o offset sem copiar uma régua de exemplo", () => {
    expect(textoOffsetMarcador("emissao", null)).toBe("-");
    expect(textoOffsetMarcador("noDia", 0)).toBe("0");
    expect(textoOffsetMarcador("antes", -1)).toBe("01");
    expect(textoOffsetMarcador("antes", -2)).toBe("02");
    expect(textoOffsetMarcador("depois", 10)).toBe("10");
    expect(textoOffsetMarcador("depois", 100)).toBe("100");
    expect(textoOffsetMarcador("pago", null)).toBe("");
  });

  it("ordena os passos reais e fecha com Pago", () => {
    const marcadores = marcadoresDaLinhaTempo([
      passo({ id: "atraso", naEmissao: false, dias: 7, assunto: "Sete dias", enviarWhatsapp: false }),
      passo({ id: "emissao", naEmissao: true, dias: 4, assunto: "Boleto emitido", enviarWhatsapp: false }),
      passo({ id: "antes", naEmissao: false, dias: -2, assunto: "Dois antes", enviarWhatsapp: true }),
      passo({ id: "hoje", naEmissao: false, dias: 0, assunto: "Vence hoje", enviarWhatsapp: true }),
      passo({ id: "dois", naEmissao: false, dias: 2, assunto: "Dois depois", enviarWhatsapp: false }),
    ]);

    expect(marcadores.map((marcador) => marcador.texto)).toEqual(["-", "02", "0", "02", "07", ""]);
    expect(marcadores.map((marcador) => marcador.fase)).toEqual([
      "emissao",
      "antes",
      "noDia",
      "depois",
      "depois",
      "pago",
    ]);
    expect(marcadores.map((marcador) => marcador.rotuloFase)).toEqual([
      "Emissão",
      "Antes do vencimento",
      "No dia do vencimento",
      "Depois do vencimento",
      null,
      "Pago",
    ]);
    expect(marcadores.map((marcador) => marcador.canais)).toEqual([
      ["email"],
      ["email", "whatsapp"],
      ["email", "whatsapp"],
      ["email"],
      ["email"],
      [],
    ]);
    expect(marcadores.map((marcador) => marcador.indice)).toEqual([1, 2, 3, 4, 0, null]);
    expect(marcadores[1]?.dica).toBe("2 dias antes do vencimento · E-mail e WhatsApp · Dois antes");
    expect(marcadores[3]?.dica).toBe("2 dias depois do vencimento · E-mail · Dois depois");
    expect(marcadores[0]?.dica).toBe("Emissão do boleto · E-mail · Boleto emitido");
    expect(marcadores.at(-1)?.dica).toBe("Pago · quando o cliente paga a cobrança");
    expect(marcadores.at(-1)?.chave).toBe("pago");
  });

  it("lê o rascunho em texto e ignora dia incompleto", () => {
    const marcadores = marcadoresDaLinhaTempo([
      passo({ naEmissao: false, dias: "", assunto: "Vazio" }),
      passo({ naEmissao: false, dias: "-", assunto: "Sinal" }),
      passo({ naEmissao: true, dias: "9", assunto: "Na emissão" }),
      passo({ naEmissao: false, dias: "-5", assunto: "Cinco antes" }),
      passo({ naEmissao: false, dias: "3", assunto: "Três depois" }),
      passo({ naEmissao: false, dias: "0", assunto: "Hoje" }),
    ]);

    expect(marcadores.map((marcador) => marcador.texto)).toEqual(["-", "05", "0", "03", ""]);
    expect(marcadores.map((marcador) => marcador.fase)).toEqual(["emissao", "antes", "noDia", "depois", "pago"]);
    expect(marcadores.map((marcador) => marcador.assunto)).toEqual(["Na emissão", "Cinco antes", "Hoje", "Três depois", ""]);
  });

  it("não inventa os dias 02, 04, 07, 10, 15, 20 e 30", () => {
    const marcadores = marcadoresDaLinhaTempo([
      passo({ naEmissao: false, dias: -5, assunto: "Antes" }),
      passo({ naEmissao: false, dias: 3, assunto: "Depois" }),
    ]);
    const textos = marcadores.map((marcador) => marcador.texto);
    expect(textos).toEqual(["05", "03", ""]);
    expect(textos).not.toContain("04");
    expect(textos).not.toContain("15");
  });

  it("repete a fase sem repetir o rótulo e mantém a ordem original no mesmo dia", () => {
    const marcadores = marcadoresDaLinhaTempo([
      passo({ id: "b", naEmissao: false, dias: -2, assunto: "Segundo" }),
      passo({ id: "a", naEmissao: false, dias: -10, assunto: "Primeiro" }),
      passo({ id: "c", naEmissao: false, dias: -2, assunto: "Terceiro" }),
      passo({ id: "e1", naEmissao: true, dias: null, assunto: "Uma" }),
      passo({ id: "e2", naEmissao: true, dias: null, assunto: "Outra" }),
    ]);

    expect(marcadores.map((marcador) => marcador.chave)).toEqual(["e1", "e2", "a", "b", "c", "pago"]);
    expect(marcadores.map((marcador) => marcador.rotuloFase)).toEqual([
      "Emissão",
      null,
      "Antes do vencimento",
      null,
      null,
      "Pago",
    ]);
    expect(marcadores[4]?.dica).toBe("2 dias antes do vencimento · E-mail · Terceiro");
    expect(marcadores[3]?.dica).toBe("2 dias antes do vencimento · E-mail · Segundo");
  });

  it("ainda fecha com Pago quando a régua não tem passos válidos", () => {
    expect(marcadoresDaLinhaTempo([])).toEqual([
      {
        chave: "pago",
        fase: "pago",
        rotuloFase: "Pago",
        texto: "",
        dias: null,
        canais: [],
        assunto: "",
        dica: "Pago · quando o cliente paga a cobrança",
        indice: null,
      },
    ]);
  });
});
