import { describe, expect, it } from "vitest";
import {
  canalDoDestino,
  chaveTelefone,
  codigoErroDoMotivo,
  instanteFimBrt,
  instanteInicioBrt,
  lerPeriodoMensagens,
  motivoLegivel,
  rotuloDoEnvio,
  statusDaMensagem,
  textoDoEnvio,
} from "./mensagens-twilio";

describe("status das mensagens da Twilio", () => {
  it("traduz a fila e o webhook para o rótulo em português", () => {
    expect(statusDaMensagem({ statusFila: "PENDENTE", motivo: null, eventos: [] })).toBe("NA_FILA");
    expect(statusDaMensagem({ statusFila: "PROCESSANDO", motivo: null, eventos: [] })).toBe("NA_FILA");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: null, eventos: [] })).toBe("ENVIADA");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: "Twilio queued", eventos: [] })).toBe("NA_FILA");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: "Twilio sent", eventos: [] })).toBe("ENVIADA");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: "Twilio delivered", eventos: [] })).toBe("ENTREGUE");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: "Twilio read", eventos: [] })).toBe("LIDA");
    expect(statusDaMensagem({ statusFila: "FALHOU", motivo: "Twilio 63003", eventos: [] })).toBe("FALHOU");
    expect(statusDaMensagem({ statusFila: "FALHOU", motivo: "Twilio undelivered", eventos: [] })).toBe("NAO_ENTREGUE");
    expect(statusDaMensagem({ statusFila: "IGNORADO", motivo: "opt-out", eventos: [] })).toBe("NAO_ENVIADA");
  });

  it("não deixa um status antigo apagar uma entrega mais nova", () => {
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: "Twilio sent", eventos: ["sent", "delivered", "read"] })).toBe(
      "LIDA",
    );
    expect(statusDaMensagem({ statusFila: "FALHOU", motivo: "Twilio 63016", eventos: ["sent", "failed"] })).toBe("FALHOU");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: null, eventos: ["failed", "delivered"] })).toBe("ENTREGUE");
    expect(statusDaMensagem({ statusFila: "ENVIADO", motivo: null, eventos: ["delivered", "undelivered"] })).toBe(
      "NAO_ENTREGUE",
    );
  });

  it("explica o código da Twilio e o motivo interno", () => {
    expect(codigoErroDoMotivo("Twilio 63016")).toBe("63016");
    expect(motivoLegivel("Twilio 63016")).toBe(
      "63016 — Fora da janela de 24 horas. Só um modelo aprovado pode ser enviado.",
    );
    expect(motivoLegivel("Twilio 63003", "Channel not found")).toContain("63003");
    expect(motivoLegivel("Twilio 63003", "Channel not found")).toContain("Channel not found");
    expect(motivoLegivel("Twilio delivered")).toBeNull();
    expect(motivoLegivel("cliente sem WhatsApp")).toBe("cliente sem WhatsApp");
    expect(motivoLegivel("Twilio 99999")).toBe("99999 — A Twilio recusou a mensagem.");
  });

  it("separa WhatsApp de SMS e reconhece o telefone do cliente", () => {
    expect(canalDoDestino("whatsapp:+5513988881001")).toBe("WHATSAPP");
    expect(canalDoDestino(null)).toBe("WHATSAPP");
    expect(canalDoDestino("+5513988881001")).toBe("SMS");
    expect(chaveTelefone("whatsapp:+5513988881001")).toBe("5513988881001");
    expect(chaveTelefone("13988881001")).toBe("5513988881001");
    expect(chaveTelefone("+14155550100")).toBe("14155550100");
  });

  it("mostra o passo da régua, o aviso de pago e o link do cartão", () => {
    expect(
      rotuloDoEnvio({
        tipo: "VENCE_EM_DIAS",
        rotulo: "WhatsApp · vence em 3 dias",
        passo: { naEmissao: false, dias: -3, assunto: "3 dias antes", reguaNome: "Padrão" },
      }),
    ).toBe("Régua · Padrão · 3 dias antes");
    expect(rotuloDoEnvio({ tipo: "PAGO", rotulo: "WhatsApp · pago", passo: null })).toBe("Aviso de pagamento");
    expect(rotuloDoEnvio({ tipo: "VENCE_EM_DIAS", rotulo: "WhatsApp · link do cartão", passo: null })).toBe(
      "Envio do link do cartão",
    );
    expect(textoDoEnvio("WhatsApp · vence em 3 dias", JSON.stringify({ "1": "Padaria", "2": "R$ 150,00", "5": "https://exemplo.test" }))).toBe(
      "WhatsApp · vence em 3 dias (Padaria, R$ 150,00)",
    );
  });

  it("corta o período no dia de Brasília", () => {
    expect(instanteInicioBrt("2026-11-11")?.toISOString()).toBe("2026-11-11T03:00:00.000Z");
    expect(instanteFimBrt("2026-11-11")?.toISOString()).toBe("2026-11-12T02:59:59.999Z");
    const periodo = lerPeriodoMensagens({ periodo: "7" }, "2026-11-11");
    expect(periodo.de).toBe("2026-11-05");
    expect(periodo.ate).toBe("2026-11-11");
    expect(lerPeriodoMensagens({}, "2026-11-11").periodo).toBe("30");
    expect(lerPeriodoMensagens({ periodo: "todos" }, "2026-11-11").inicio).toBeNull();
    expect(lerPeriodoMensagens({ periodo: "personalizado", de: "2026-11-01", ate: "ruim" }, "2026-11-11")).toMatchObject({
      de: "2026-11-01",
      ate: "",
    });
  });
});
