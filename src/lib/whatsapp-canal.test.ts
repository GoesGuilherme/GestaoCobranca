import { describe, expect, it } from "vitest";
import { REMETENTE_OFICIAL_WHATSAPP, REMETENTE_SANDBOX_WHATSAPP } from "@/server/twilio/sandbox";
import { descreverCanalWhatsapp, NUMERO_OFICIAL_TAGUARO, NUMERO_SANDBOX_TWILIO } from "./whatsapp-canal";

const base = {
  modoTeste: true,
  remetenteOficialLigado: false,
  sandboxLigado: false,
  numeroTesteConfigurado: true,
  templatesContaPaiProntos: true,
  numeroEmpresaPronto: false,
};

describe("texto do canal de WhatsApp", () => {
  it("os números exibidos são os do código", () => {
    expect(REMETENTE_OFICIAL_WHATSAPP).toBe("whatsapp:+16504762069");
    expect(NUMERO_OFICIAL_TAGUARO.replace(/\D/g, "")).toBe("16504762069");
    expect(REMETENTE_SANDBOX_WHATSAPP).toBe("whatsapp:+14155238886");
    expect(NUMERO_SANDBOX_TWILIO.replace(/\D/g, "")).toBe("14155238886");
  });

  it("com a flag e o modo teste, sai do número da Taguaro só para o teste", () => {
    const texto = descreverCanalWhatsapp({ ...base, remetenteOficialLigado: true, numeroEmpresaPronto: true });
    expect(texto.selo).toBe("Sai pelo número da Taguaro");
    expect(texto.usaNumeroEmpresa).toBe(false);
    expect(texto.paragrafos.join(" ")).toContain(NUMERO_OFICIAL_TAGUARO);
    expect(texto.paragrafos.join(" ")).toContain("só o número de teste recebe");
    expect(texto.paragrafos.join(" ")).not.toContain("para o cliente");
  });

  it("sem template da conta pai não promete envio", () => {
    const texto = descreverCanalWhatsapp({ ...base, remetenteOficialLigado: true, templatesContaPaiProntos: false });
    expect(texto.paragrafos.join(" ")).toContain("falta template");
    expect(texto.paragrafos.join(" ")).toContain("fila");
  });

  it("a flag sem modo teste não diz que o cliente recebe do número da Taguaro", () => {
    const texto = descreverCanalWhatsapp({
      ...base,
      modoTeste: false,
      remetenteOficialLigado: true,
      numeroEmpresaPronto: false,
    });
    expect(texto.selo).toBe("WhatsApp parado");
    expect(texto.paragrafos.join(" ")).toContain("só envia com o modo teste ligado");
    expect(texto.paragrafos.join(" ")).toContain("não manda para o cliente");
  });

  it("modo teste desligado e número da empresa pronto vai para o cliente", () => {
    const texto = descreverCanalWhatsapp({ ...base, modoTeste: false, numeroEmpresaPronto: true });
    expect(texto.usaNumeroEmpresa).toBe(true);
    expect(texto.paragrafos.join(" ")).toContain("para o cliente");
    expect(texto.paragrafos.join(" ")).not.toContain(NUMERO_OFICIAL_TAGUARO);
  });

  it("sandbox só aparece no modo teste, sem número oficial e sem empresa pronta", () => {
    const texto = descreverCanalWhatsapp({ ...base, sandboxLigado: true });
    expect(texto.selo).toBe("Sai pelo sandbox");
    expect(texto.paragrafos.join(" ")).toContain(NUMERO_SANDBOX_TWILIO);
    const oficial = descreverCanalWhatsapp({ ...base, sandboxLigado: true, remetenteOficialLigado: true });
    expect(oficial.selo).toBe("Sai pelo número da Taguaro");
  });
});
