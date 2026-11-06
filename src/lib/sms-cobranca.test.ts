import { describe, expect, it, vi } from "vitest";
import type { CredencialTwilio, MensagemTexto } from "@/server/twilio/contrato";
import { NUMERO_SMS_TWILIO, decidirEnvioSms, montarMensagemSms, numeroTesteSms, remetenteSms, smsHabilitado, telefoneClienteE164 } from "./sms-cobranca";
import { enviarSmsAutorizado } from "@/server/sms/envio";

const TESTE = "+5511945511449";
const CLIENTE = "+5513988881001";
const CONTA = { accountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", authToken: "token-de-teste-nao-real" };
const CALLBACK = "https://taguaro.test/api/webhooks/twilio";

const DADOS = {
  empresa: "Padaria Sol",
  nome: "Maria Exemplo",
  valor: "R$ 150,00",
  vencimento: "30/10/2026",
  link: "https://www.asaas.com/i/exemplo",
  dias: "5",
};

function decisaoPronta(parcial: Partial<Parameters<typeof decidirEnvioSms>[0]> = {}) {
  return decidirEnvioSms({
    habilitado: true,
    modoTeste: true,
    remetente: NUMERO_SMS_TWILIO,
    teste: TESTE,
    telefoneCliente: CLIENTE,
    destinoPedido: TESTE,
    ...parcial,
  });
}

describe("SMS da régua", () => {
  it("nasce desligado e só aceita o número Twilio já comprado", () => {
    expect(smsHabilitado({})).toBe(false);
    expect(smsHabilitado({ TWILIO_SMS_ENABLED: "false" })).toBe(false);
    expect(smsHabilitado({ TWILIO_SMS_ENABLED: "true" })).toBe(true);
    expect(remetenteSms({})).toBeNull();
    expect(remetenteSms({ TWILIO_SMS_FROM: "+15550001111" })).toBeNull();
    expect(remetenteSms({ TWILIO_SMS_FROM: "+1 650 476 2069" })).toBe(NUMERO_SMS_TWILIO);
    expect(numeroTesteSms({ TWILIO_SMS_TESTE: "11945511449" })).toBe(TESTE);
    expect(numeroTesteSms({ TWILIO_WHATSAPP_TESTE: "+55 11 94551-1449" })).toBe(TESTE);
    expect(numeroTesteSms({ TWILIO_SMS_TESTE: "11945511449", TWILIO_WHATSAPP_TESTE: "11988887777" })).toBe(TESTE);
    expect(telefoneClienteE164("(13) 98888-1001")).toBe(CLIENTE);
  });

  it("não envia com o canal desligado", () => {
    const decisao = decisaoPronta({ habilitado: false });
    expect(decisao).toEqual({ enviar: false, motivo: "SMS desligado" });
  });

  it("bloqueia número que não é o de teste, mesmo com o canal ligado", () => {
    expect(decisaoPronta({ destinoPedido: CLIENTE })).toEqual({
      enviar: false,
      motivo: "modo teste não envia para este número",
    });
    expect(decisaoPronta({ destinoPedido: `whatsapp:${TESTE}` })).toEqual({
      enviar: false,
      motivo: "modo teste não envia para este número",
    });
    expect(decisaoPronta({ modoTeste: false, destinoPedido: TESTE })).toEqual({
      enviar: false,
      motivo: "SMS só sai no modo teste",
    });
    expect(decisaoPronta()).toEqual({ enviar: true, de: NUMERO_SMS_TWILIO, para: TESTE });
  });

  it("monta o texto em português, começando pelo nome da empresa", () => {
    const gerado = montarMensagemSms("BOLETO_GERADO", DADOS);
    const vence = montarMensagemSms("VENCE_EM_DIAS", DADOS);
    const hoje = montarMensagemSms("VENCE_EM_DIAS", { ...DADOS, dias: "0" });
    const venceu = montarMensagemSms("VENCEU", { ...DADOS, link: "" });
    const pago = montarMensagemSms("PAGO", DADOS);
    expect(gerado).toBe(
      "Padaria Sol: Olá, Maria Exemplo. Seu boleto de R$ 150,00, com vencimento em 30/10/2026, foi gerado. Acesse: https://www.asaas.com/i/exemplo. Responda PARAR para não receber.",
    );
    expect(vence).toContain("vence em 5 dias, na data 30/10/2026");
    expect(hoje).toContain("vence hoje, na data 30/10/2026");
    expect(venceu).toContain("está em atraso");
    expect(venceu).not.toContain("Acesse:");
    expect(pago).toContain("Confirmamos o pagamento de R$ 150,00");
    for (const texto of [gerado, vence, hoje, venceu, pago]) {
      expect(texto?.startsWith("Padaria Sol:")).toBe(true);
      expect(texto).toContain("Maria Exemplo");
      expect(texto).toContain("R$ 150,00");
      expect(texto).toContain("30/10/2026");
    }
    expect(montarMensagemSms("VENCE_EM_DIAS", { ...DADOS, dias: "" })).toBeNull();
    expect(montarMensagemSms("BOLETO_GERADO", { ...DADOS, empresa: "  " })).toBeNull();
  });

  it("chama a API de mensagem só para o número de teste, sem credencial real", async () => {
    const enviarTexto = vi.fn<(conta: CredencialTwilio, mensagem: MensagemTexto) => Promise<{ sid: string }>>(
      async () => ({ sid: "SMteste000000000000000000000000" }),
    );
    const twilio = { enviarTexto };
    const liberado = decisaoPronta();
    const corpo = montarMensagemSms("BOLETO_GERADO", DADOS) ?? "";
    const enviado = await enviarSmsAutorizado(twilio, CONTA, {
      decisao: liberado,
      teste: TESTE,
      corpo: `Modo teste: esta SMS não foi para o cliente. ${corpo}`,
      statusCallback: CALLBACK,
    });
    expect(enviado).toEqual({ enviado: true, sid: "SMteste000000000000000000000000" });
    expect(enviarTexto).toHaveBeenCalledTimes(1);
    expect(enviarTexto).toHaveBeenCalledWith(CONTA, {
      de: NUMERO_SMS_TWILIO,
      para: TESTE,
      corpo: expect.stringContaining("Padaria Sol:"),
      statusCallback: CALLBACK,
    });
    const chamada = enviarTexto.mock.calls[0]?.[1];
    expect(chamada?.para).toBe(TESTE);
    expect(chamada?.para).not.toContain("whatsapp:");
    expect(chamada?.de).not.toContain("whatsapp:");
    expect(JSON.stringify(chamada)).not.toContain("ContentSid");

    enviarTexto.mockClear();
    const bloqueado = await enviarSmsAutorizado(twilio, CONTA, {
      decisao: { enviar: true, de: NUMERO_SMS_TWILIO, para: CLIENTE },
      teste: TESTE,
      corpo,
      statusCallback: CALLBACK,
    });
    expect(bloqueado).toEqual({ enviado: false, motivo: "modo teste não envia para este número" });
    expect(enviarTexto).not.toHaveBeenCalled();

    const desligado = await enviarSmsAutorizado(twilio, CONTA, {
      decisao: { enviar: false, motivo: "SMS desligado" },
      teste: TESTE,
      corpo,
      statusCallback: CALLBACK,
    });
    expect(desligado.enviado).toBe(false);
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});
