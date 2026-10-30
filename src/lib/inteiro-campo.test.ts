import { describe, expect, it } from "vitest";
import { inteiroDeCampo, textoHoraPermitido, textoInteiroPermitido } from "./inteiro-campo";
import { montarReguaParaSalvar, rotuloPassoRascunho, textoDiasDe, type ReguaRascunho } from "./regua-rascunho";

function rascunho(parcial: Partial<ReguaRascunho> & { dias?: string; naEmissao?: boolean } = {}): ReguaRascunho {
  const { dias = "-3", naEmissao = false, ...resto } = parcial;
  return {
    nome: "Padrão",
    padrao: true,
    horaInicio: "8",
    horaFim: "18",
    enviarFimDeSemana: false,
    passos: [
      {
        naEmissao,
        dias,
        assunto: "Sua cobrança vence hoje",
        corpo: "Olá, {cliente}.",
        enviarWhatsapp: false,
      },
    ],
    ...resto,
  };
}

describe("inteiro de campo", () => {
  it("deixa digitar vazio, sinal e dígitos, e recusa o resto", () => {
    expect(textoInteiroPermitido("")).toBe(true);
    expect(textoInteiroPermitido("-")).toBe(true);
    expect(textoInteiroPermitido("3")).toBe(true);
    expect(textoInteiroPermitido("-3")).toBe(true);
    expect(textoInteiroPermitido("-03")).toBe(true);
    expect(textoInteiroPermitido("8a")).toBe(false);
    expect(textoInteiroPermitido("--1")).toBe(false);
    expect(textoInteiroPermitido("3-")).toBe(false);
    expect(textoInteiroPermitido("1.5")).toBe(false);
    expect(textoHoraPermitido("")).toBe(true);
    expect(textoHoraPermitido("8")).toBe(true);
    expect(textoHoraPermitido("08")).toBe(true);
    expect(textoHoraPermitido("-")).toBe(false);
    expect(textoHoraPermitido("123")).toBe(false);
  });

  it("só converte um inteiro completo e nunca devolve NaN", () => {
    expect(inteiroDeCampo("")).toBeNull();
    expect(inteiroDeCampo("-")).toBeNull();
    expect(inteiroDeCampo(" ")).toBeNull();
    expect(inteiroDeCampo("8a")).toBeNull();
    expect(inteiroDeCampo("-3")).toBe(-3);
    expect(inteiroDeCampo("-03")).toBe(-3);
    expect(inteiroDeCampo("0")).toBe(0);
    expect(inteiroDeCampo("-0")).toBe(0);
    expect(Number.isNaN(inteiroDeCampo("-"))).toBe(false);
  });
});

describe("régua para salvar", () => {
  it("recusa hífen solto e hora inválida em vez de gravar NaN", () => {
    const dias = montarReguaParaSalvar(rascunho({ dias: "-" }));
    expect(dias.ok).toBe(false);
    if (!dias.ok) expect(dias.mensagem).toMatch(/número inteiro/);

    const vazio = montarReguaParaSalvar(rascunho({ dias: "" }));
    expect(vazio.ok).toBe(false);

    const hora = montarReguaParaSalvar(rascunho({ horaInicio: "-" }));
    expect(hora.ok).toBe(false);
    if (!hora.ok) expect(hora.mensagem).toMatch(/0 a 23/);

    const fora = montarReguaParaSalvar(rascunho({ dias: "400" }));
    expect(fora.ok).toBe(false);
  });

  it("grava -3, normaliza -03 e faz o valor salvo voltar ao campo", () => {
    const salvo = montarReguaParaSalvar(rascunho({ dias: "-3" }));
    expect(salvo.ok).toBe(true);
    if (!salvo.ok) return;
    expect(salvo.corpo.passos[0]?.dias).toBe(-3);
    expect(textoDiasDe(salvo.corpo.passos[0]?.dias ?? null, false)).toBe("-3");

    const normalizado = montarReguaParaSalvar(rascunho({ dias: "-03" }));
    expect(normalizado.ok).toBe(true);
    if (!normalizado.ok) return;
    expect(normalizado.corpo.passos[0]?.dias).toBe(-3);
    expect(textoDiasDe(-3, false)).toBe("-3");
    expect(textoDiasDe(null, true)).toBe("");
  });

  it("na emissão envia dias nulos e a hora vira inteiro", () => {
    const salvo = montarReguaParaSalvar(rascunho({ naEmissao: true, dias: "-3", horaInicio: "08", horaFim: "18" }));
    expect(salvo.ok).toBe(true);
    if (!salvo.ok) return;
    expect(salvo.corpo.horaInicio).toBe(8);
    expect(salvo.corpo.horaFim).toBe(18);
    expect(salvo.corpo.passos[0]).toMatchObject({ naEmissao: true, dias: null });
  });

  it("o rótulo não vira NaN enquanto o sinal está incompleto", () => {
    expect(rotuloPassoRascunho({ naEmissao: false, dias: "-" })).toBe("Dias em relação ao vencimento");
    expect(rotuloPassoRascunho({ naEmissao: false, dias: "" })).toBe("Dias em relação ao vencimento");
    expect(rotuloPassoRascunho({ naEmissao: false, dias: "-3" })).toBe("3 dias antes");
    expect(rotuloPassoRascunho({ naEmissao: false, dias: "0" })).toBe("No vencimento");
    expect(rotuloPassoRascunho({ naEmissao: true, dias: "" })).toBe("Na emissão");
  });
});
