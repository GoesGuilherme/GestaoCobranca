import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

import { FormularioModelosWhatsapp } from "@/components/formulario-modelos-whatsapp";
import type { TemplateTelefoneDTO } from "@/lib/tipos";
import { FRASE_BOTAO_PROMESSA } from "@/lib/whatsapp-promessa";
import {
  corpoPadraoEditavel,
  validarCorpoTemplate,
  variaveisDoCorpoAmigavel,
} from "@/lib/template-whatsapp-editor";

const TOKEN = `pp1_${"C".repeat(43)}`;

function modelo(tipo: TemplateTelefoneDTO["tipo"], corpo: string): TemplateTelefoneDTO {
  return {
    tipo,
    rotulo: tipo,
    contentSid: null,
    status: "",
    statusRotulo: "Não cadastrado",
    motivo: null,
    corpo,
    temBotao: false,
  };
}

describe("texto do modelo de WhatsApp", () => {
  it("aceita o padrão com a marca e recusa o que a Meta recusa", () => {
    const boleto = corpoPadraoEditavel("BOLETO_GERADO", "Padaria {Sol}", true);
    expect(boleto).toContain("A Padaria Sol avisa:");
    expect(boleto).not.toContain("{Sol}");
    expect(boleto).toContain(FRASE_BOTAO_PROMESSA);
    const valido = validarCorpoTemplate("BOLETO_GERADO", boleto, true);
    expect(valido.ok).toBe(true);
    if (!valido.ok) return;
    expect(valido.twilio.variavelBotao).toBe("5");
    expect(valido.twilio.ordem).toEqual(["nome", "valor", "vencimento", "link"]);

    const dias = validarCorpoTemplate("VENCE_EM_DIAS", corpoPadraoEditavel("VENCE_EM_DIAS", "Marca", true), true);
    expect(dias.ok && dias.twilio.variavelBotao).toBe("6");
    expect(validarCorpoTemplate("PAGO", corpoPadraoEditavel("PAGO", "Marca", false), true).ok).toBe(false);
    expect(validarCorpoTemplate("BOLETO_GERADO", "{nome} boleto {link}.", true).ok).toBe(false);
    expect(validarCorpoTemplate("BOLETO_GERADO", "Olá {nome}. Link {link}", false).ok).toBe(false);
    expect(validarCorpoTemplate("BOLETO_GERADO", "Olá {nome}{valor}. Link {link}. Obrigado.", true).ok).toBe(false);
    expect(validarCorpoTemplate("BOLETO_GERADO", "Olá {nome}. {dias} dias. Link {link}. Obrigado.", true).ok).toBe(false);
    expect(validarCorpoTemplate("BOLETO_GERADO", `${"a".repeat(1100)} {link}. fim`, true).ok).toBe(false);

    const variaveis = variaveisDoCorpoAmigavel(
      boleto,
      {
        nome: "Ana",
        valor: "R$ 10,00",
        vencimento: "20/11/2026",
        link: "https://exemplo.test/fatura",
      },
      TOKEN,
    );
    expect(variaveis?.["1"]).toBe("Ana");
    expect(variaveis?.["4"]).toBe("https://exemplo.test/fatura");
    expect(variaveis?.["5"]).toBe(TOKEN);
  });

  it("a tela só habilita Salvar depois da mudança e a migration só acrescenta", () => {
    const corpo = corpoPadraoEditavel("BOLETO_GERADO", "Empresa Telefone", true);
    const html = renderToStaticMarkup(
      createElement(FormularioModelosWhatsapp, {
        inicial: {
          marca: "Empresa Telefone",
          promessaWhatsapp: true,
          podeEnviarModelo: true,
          templates: [
            modelo("BOLETO_GERADO", corpo),
            modelo("VENCE_EM_DIAS", corpoPadraoEditavel("VENCE_EM_DIAS", "Empresa Telefone", true)),
            modelo("VENCE_HOJE", corpoPadraoEditavel("VENCE_HOJE", "Empresa Telefone", true)),
            modelo("VENCEU", corpoPadraoEditavel("VENCEU", "Empresa Telefone", true)),
            modelo("PAGO", corpoPadraoEditavel("PAGO", "Empresa Telefone", false)),
          ],
        },
      }),
    );
    expect(html).toContain("Permitir promessa pelo WhatsApp");
    expect(html).toContain("Enviar para aprovação");
    expect(html).toContain("Empresa Telefone");
    expect(html).toContain(">Salvar<");
    expect(html).toContain("disabled");
    expect(html).toContain("Registrar promessa");
    expect(html).toContain("Este modelo sai sem o botão de promessa.");
    const sql = readFileSync("prisma/migrations/20261118040000_template_botao_whatsapp/migration.sql", "utf8");
    expect(sql).toContain("promessa_whatsapp");
    expect(sql).toContain("tem_botao");
    expect(sql).toContain("corpo_enviado");
    expect(sql).not.toContain("DROP");
  });
});
