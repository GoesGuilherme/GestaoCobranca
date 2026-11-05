import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CanalWhatsappDTO, ConfiguracaoTwilioDTO } from "@/lib/tipos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
}));

import { PainelWhatsapp } from "./painel-whatsapp";

const twilio: ConfiguracaoTwilioDTO = {
  conectada: false,
  subaccountSid: null,
  senderTelefone: null,
  senderStatus: null,
  coexistencia: "NAO_SOLICITADA",
  nomeExibicao: "Empresa QR",
  wabaId: null,
  erro: null,
  tokenMascarado: null,
  templates: [],
};

const canal: CanalWhatsappDTO = {
  evolutionHabilitada: true,
  provedor: "EVOLUTION",
  status: "CONECTANDO",
  telefone: "(11) 98888-7777",
  erro: null,
  qrCode: "javascript:alert(1)",
  alertas: [
    {
      codigo: "WHATSAPP_DESCONECTADO",
      titulo: "WhatsApp desconectado",
      texto: "A régua segurou as cobranças deste canal.",
      lido: false,
    },
  ],
};

describe("tela de WhatsApp", () => {
  it("mostra o canal e o aviso ao dono, sem chave e sem QR inseguro na primeira pintura", () => {
    const html = renderToStaticMarkup(
      createElement(PainelWhatsapp, { podeEditar: true, nomeEmpresa: "Empresa QR", inicial: twilio, canalInicial: canal }),
    );
    expect(html).toContain("Gerar QR Code");
    expect(html).toContain("Aguardando a leitura do QR Code");
    expect(html).toContain("WhatsApp desconectado");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("chave-evolution");
  });

  it("financeiro vê o estado e não vê os botões de conexão", () => {
    const html = renderToStaticMarkup(
      createElement(PainelWhatsapp, { podeEditar: false, nomeEmpresa: "Empresa QR", inicial: twilio, canalInicial: canal }),
    );
    expect(html).toContain("Aguardando a leitura do QR Code");
    expect(html).toContain("WhatsApp desconectado");
    expect(html).not.toContain("Gerar QR Code");
    expect(html).not.toContain("Desconectar");
  });
});