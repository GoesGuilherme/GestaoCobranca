import { describe, expect, it } from "vitest";
import {
  descreverEnvioWhatsapp,
  montarEntradaExibicaoWhatsapp,
  NOTA_MODO_TESTE_WHATSAPP,
  type RotaExibicaoWhatsapp,
} from "./whatsapp-canal";

const rotas: RotaExibicaoWhatsapp[] = ["oficial_teste", "oficial_producao", "sandbox", "empresa", "nenhuma"];

function frases() {
  return rotas.flatMap((rota) => {
    const entrada = montarEntradaExibicaoWhatsapp({
      envioEmpresa: rota === "nenhuma",
      numeroPadraoAtivo: "+5511999990000",
      temModeloAprovado: rota !== "nenhuma",
      rota,
      numeroAntigoPronto: "+5511888887777",
    });
    const texto = descreverEnvioWhatsapp(entrada);
    const semModelo = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: true,
        numeroPadraoAtivo: "+5511999990000",
        temModeloAprovado: false,
        rota,
        numeroAntigoPronto: "+5511888887777",
      }),
    );
    return [texto.titulo, texto.complemento ?? "", semModelo.titulo, semModelo.complemento ?? ""];
  });
}

describe("texto de onde saem as mensagens de WhatsApp", () => {
  it("não mostra sandbox, variável de ambiente, número +1 nem código da conta principal", () => {
    const texto = [...frases(), NOTA_MODO_TESTE_WHATSAPP].join("\n");
    expect(texto).not.toMatch(/sandbox/i);
    expect(texto).not.toMatch(/ContentSid/i);
    expect(texto).not.toMatch(/conta pai/i);
    expect(texto).not.toMatch(/\+1[\s-]*\d/);
    expect(texto).not.toMatch(/TWILIO_|process\.env/i);
  });

  it("com número da empresa e modelo aprovado, diz esse número", () => {
    const texto = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: true,
        numeroPadraoAtivo: "+5511988887777",
        temModeloAprovado: true,
        rota: "oficial_producao",
        numeroAntigoPronto: "+5511900000000",
      }),
    );
    expect(texto.titulo).toBe("As mensagens saem do número +5511988887777.");
    expect(texto.complemento).toBeNull();
  });

  it("sem número da empresa pronto, o caminho oficial fala só da Taguaro", () => {
    const texto = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: false,
        numeroPadraoAtivo: null,
        temModeloAprovado: false,
        rota: "oficial_teste",
        numeroAntigoPronto: "+5511900000000",
      }),
    );
    expect(texto.titulo).toBe("As mensagens saem pelo número da Taguaro.");
    expect(texto.titulo).not.toContain("+5511900000000");
  });

  it("o número antigo só aparece quando é ele que envia", () => {
    const texto = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: false,
        numeroPadraoAtivo: null,
        temModeloAprovado: false,
        rota: "empresa",
        numeroAntigoPronto: "+5511911112222",
      }),
    );
    expect(texto.titulo).toBe("As mensagens saem do número +5511911112222.");
  });

  it("número de teste não leva o nome interno e avisa que o cliente não recebe", () => {
    const texto = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: false,
        numeroPadraoAtivo: null,
        temModeloAprovado: false,
        rota: "sandbox",
        numeroAntigoPronto: null,
      }),
    );
    expect(texto.titulo).toBe("As mensagens saem por um número de teste.");
    expect(texto.complemento).toBe("O cliente não recebe.");
  });

  it("número ativo sem modelo aprovado não promete envio por ele", () => {
    const texto = descreverEnvioWhatsapp(
      montarEntradaExibicaoWhatsapp({
        envioEmpresa: true,
        numeroPadraoAtivo: "+5511988887777",
        temModeloAprovado: false,
        rota: "nenhuma",
        numeroAntigoPronto: null,
      }),
    );
    expect(texto.titulo).toBe("Nenhuma mensagem de WhatsApp sai neste momento.");
    expect(texto.complemento).toContain("+5511988887777");
    expect(texto.complemento).toContain("falta um modelo aprovado");
  });
});
