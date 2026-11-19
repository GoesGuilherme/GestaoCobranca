import { describe, expect, it } from "vitest";
import {
  conversaJaListada,
  filtrosCaixaAtivos,
  gruposPorDia,
  horaSaoPaulo,
  iniciaisDoNome,
  legendaDaBolha,
  origemDoEnvio,
  rotuloDiaConversa,
  ticksDoStatus,
  urlSemAbasMensagens,
} from "./caixa-mensagens";

const AGORA = new Date("2026-11-18T15:00:00.000Z");

describe("caixa de mensagens", () => {
  it("monta iniciais e o dia em Brasília", () => {
    expect(iniciaisDoNome("Oficina Azul")).toBe("OA");
    expect(iniciaisDoNome("Padaria")).toBe("PA");
    expect(iniciaisDoNome("Número sem cadastro")).toBe("?");
    expect(rotuloDiaConversa("2026-11-18T15:00:00.000Z", AGORA)).toBe("Hoje");
    expect(rotuloDiaConversa("2026-11-18T02:30:00.000Z", AGORA)).toBe("Ontem");
    expect(rotuloDiaConversa("2026-11-16T15:00:00.000Z", AGORA)).toBe("16/11/2026");
    expect(horaSaoPaulo("2026-11-18T15:30:00.000Z")).toBe("12:30");
    expect(gruposPorDia([{ quando: "2026-11-16T15:00:00.000Z" }, { quando: "2026-11-18T15:00:00.000Z" }], AGORA).map((grupo) => grupo.rotulo)).toEqual([
      "16/11/2026",
      "Hoje",
    ]);
  });

  it("marca origem, template e o tique de leitura", () => {
    expect(
      origemDoEnvio({
        tipo: "VENCE_EM_DIAS",
        rotulo: "WhatsApp · vence em 3 dias",
        passo: { naEmissao: false, dias: -3, assunto: "3 dias antes" },
      }),
    ).toEqual({ origem: "Régua · 3 dias antes", template: "taguaro_vence_em_dias_v2" });
    expect(origemDoEnvio({ tipo: "PAGO", rotulo: "WhatsApp · pago", passo: null })).toEqual({
      origem: "taguaro_pago_v2",
      template: "taguaro_pago_v2",
    });
    expect(origemDoEnvio({ tipo: "LINK", rotulo: "WhatsApp · link do cartão", passo: null })).toEqual({
      origem: "Manual",
      template: null,
    });
    expect(ticksDoStatus("LIDA")).toBe("lida");
    expect(ticksDoStatus("ENTREGUE")).toBe("entregue");
    expect(ticksDoStatus("ENVIADA")).toBe("enviada");
    expect(ticksDoStatus("FALHOU")).toBe("falha");
    expect(ticksDoStatus("NAO_ENTREGUE")).toBe("falha");
    expect(
      legendaDaBolha({
        id: "1",
        lado: "empresa",
        quando: AGORA.toISOString(),
        texto: "Oi",
        detalhe: null,
        origem: "Régua · 3 dias antes",
        template: "taguaro_vence_em_dias_v2",
        cobrancaId: "fat",
        cobranca: "Mensalidade",
        canal: "SMS",
        ticks: "lida",
        motivo: null,
        modoTeste: false,
      }),
    ).toBe("SMS · Régua · 3 dias antes · taguaro_vence_em_dias_v2");
    expect(
      legendaDaBolha({
        id: "ia",
        lado: "empresa",
        quando: AGORA.toISOString(),
        texto: "Fatura em aberto.",
        detalhe: "IA",
        origem: "IA",
        template: null,
        cobrancaId: null,
        cobranca: null,
        canal: "WHATSAPP",
        ticks: "enviada",
        motivo: null,
        modoTeste: false,
      }),
    ).toBe("IA");
  });

  it("redireciona as abas antigas e conta filtros", () => {
    expect(urlSemAbasMensagens({ aba: "conversas", conversa: "5513988881004", q: "azul" })).toBe(
      "/mensagens?q=azul&conversa=5513988881004",
    );
    expect(urlSemAbasMensagens({ aba: "envios", status: "LIDA" })).toBe("/mensagens?periodo=30&status=LIDA");
    expect(urlSemAbasMensagens({ aba: "envios", periodo: "7" })).toBe("/mensagens?periodo=7");
    expect(urlSemAbasMensagens({ mensagem: "abc", conversa: "5513988881004" })).toBe("/mensagens?conversa=5513988881004");
    expect(urlSemAbasMensagens({})).toBeNull();
    expect(filtrosCaixaAtivos({ periodo: "todos", status: "", canal: "", clienteId: "" })).toBe(0);
    expect(filtrosCaixaAtivos({ periodo: "7", status: "LIDA", canal: "SMS", clienteId: "cli" })).toBe(4);
  });

  it("não repete a conversa que já entrou na página anterior", () => {
    const cursor = { quando: new Date("2026-11-18T12:00:00.000Z"), telefone: "5513988881002" };
    expect(conversaJaListada("2026-11-18T13:00:00.000Z", "5513988881001", cursor)).toBe(true);
    expect(conversaJaListada("2026-11-18T12:00:00.000Z", "5513988881003", cursor)).toBe(true);
    expect(conversaJaListada("2026-11-18T12:00:00.000Z", "5513988881002", cursor)).toBe(true);
    expect(conversaJaListada("2026-11-18T12:00:00.000Z", "5513988881001", cursor)).toBe(false);
    expect(conversaJaListada("2026-11-18T11:00:00.000Z", "5513988881099", cursor)).toBe(false);
  });
});
