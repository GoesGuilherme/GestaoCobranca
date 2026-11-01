import { describe, expect, it } from "vitest";
import { ariaProgressoRegua, momentoEtapaRegua, nomeEtapaRegua, progressoDaFatura, textoEtapa, type ReguaParaProgresso } from "./regua-progresso";

const reguas: ReguaParaProgresso[] = [
  {
    id: "padrao",
    padrao: true,
    nome: "Padrão",
    passos: [
      { id: "emissao", ordem: 0, naEmissao: true, dias: null },
      { id: "antes", ordem: 1, naEmissao: false, dias: -3 },
      { id: "hoje", ordem: 2, naEmissao: false, dias: 0 },
      { id: "atraso5", ordem: 3, naEmissao: false, dias: 5 },
      { id: "atraso10", ordem: 4, naEmissao: false, dias: 10 },
    ],
  },
  {
    id: "vip",
    padrao: false,
    nome: "VIP",
    passos: [
      { id: "vip-hoje", ordem: 1, naEmissao: false, dias: 0 },
      { id: "vip-antes", ordem: 0, naEmissao: false, dias: -1 },
    ],
  },
];

describe("progresso da régua na fatura", () => {
  it("nomeia o momento de cada etapa", () => {
    expect(nomeEtapaRegua({ naEmissao: true, dias: null })).toBe("Na emissão");
    expect(nomeEtapaRegua({ naEmissao: false, dias: -3 })).toBe("Lembrete 3 dias antes");
    expect(nomeEtapaRegua({ naEmissao: false, dias: -1 })).toBe("Lembrete 1 dia antes");
    expect(nomeEtapaRegua({ naEmissao: false, dias: 0 })).toBe("No vencimento");
    expect(nomeEtapaRegua({ naEmissao: false, dias: null })).toBe("No vencimento");
    expect(nomeEtapaRegua({ naEmissao: false, dias: 1 })).toBe("1 dia após");
    expect(nomeEtapaRegua({ naEmissao: false, dias: 5 })).toBe("5 dias após");
    expect(momentoEtapaRegua({ naEmissao: true, dias: null })).toBe("antes");
    expect(momentoEtapaRegua({ naEmissao: false, dias: -3 })).toBe("antes");
    expect(momentoEtapaRegua({ naEmissao: false, dias: 0 })).toBe("vencimento");
    expect(momentoEtapaRegua({ naEmissao: false, dias: 5 })).toBe("atraso");
  });

  it("deixa apagada a etapa sem envio e acende só o lembrete enviado, na ordem da régua", () => {
    const progresso = progressoDaFatura({
      status: "PENDING",
      excluida: false,
      modo: "PADRAO",
      reguaId: null,
      reguas,
      envios: [
        { passoId: "hoje", canal: "EMAIL", status: "ENVIADO" },
        { passoId: "antes", canal: "EMAIL", status: "FALHOU" },
        { passoId: "atraso5", canal: "WHATSAPP", status: "IGNORADO" },
        { passoId: "emissao", canal: "WHATSAPP", status: "ENVIADO" },
        { passoId: "emissao", canal: "EMAIL", status: "ENVIADO" },
        { passoId: "emissao", canal: "EMAIL", status: "ENVIADO" },
        { passoId: null, canal: "EMAIL", status: "ENVIADO" },
      ],
    });

    expect(progresso).toEqual({
      paga: false,
      encerrada: false,
      etapas: [
        { id: "emissao", nome: "Na emissão", momento: "antes", enviada: true, canais: ["EMAIL", "WHATSAPP"] },
        { id: "antes", nome: "Lembrete 3 dias antes", momento: "antes", enviada: false, canais: [] },
        { id: "hoje", nome: "No vencimento", momento: "vencimento", enviada: true, canais: ["EMAIL"] },
        { id: "atraso5", nome: "5 dias após", momento: "atraso", enviada: false, canais: [] },
        { id: "atraso10", nome: "10 dias após", momento: "atraso", enviada: false, canais: [] },
      ],
    });
  });

  it("usa a régua específica do cliente e a ordem cadastrada", () => {
    const progresso = progressoDaFatura({
      status: "OVERDUE",
      excluida: false,
      modo: "ESPECIFICA",
      reguaId: "vip",
      reguas,
      envios: [{ passoId: "vip-antes", canal: "WHATSAPP", status: "ENVIADO" }],
    });

    expect(progresso?.etapas.map((etapa) => etapa.id)).toEqual(["vip-antes", "vip-hoje"]);
    expect(progresso?.etapas[0]).toMatchObject({ enviada: true, canais: ["WHATSAPP"], momento: "antes" });
    expect(progresso?.etapas[1].enviada).toBe(false);
  });

  it("não desenha a régua quando o cliente não tem etapas", () => {
    expect(
      progressoDaFatura({
        status: "PENDING",
        excluida: false,
        modo: "NENHUMA",
        reguaId: null,
        reguas,
        envios: [{ passoId: "hoje", canal: "EMAIL", status: "ENVIADO" }],
      }),
    ).toBeNull();
    expect(
      progressoDaFatura({
        status: "PENDING",
        excluida: false,
        modo: "ESPECIFICA",
        reguaId: "inexistente",
        reguas,
        envios: [],
      }),
    ).toBeNull();
    expect(
      progressoDaFatura({
        status: "PENDING",
        excluida: false,
        modo: "PADRAO",
        reguaId: null,
        reguas: [{ id: "vazia", padrao: true, nome: "Padrão", passos: [] }],
        envios: [],
      }),
    ).toBeNull();
  });

  it("em fatura paga marca o check e não acende etapa que não foi enviada", () => {
    const progresso = progressoDaFatura({
      status: "RECEIVED",
      excluida: false,
      modo: "PADRAO",
      reguaId: null,
      reguas,
      envios: [{ passoId: "emissao", canal: "EMAIL", status: "ENVIADO" }],
    });

    expect(progresso?.paga).toBe(true);
    expect(progresso?.encerrada).toBe(true);
    expect(progresso?.etapas.filter((etapa) => etapa.enviada).map((etapa) => etapa.id)).toEqual(["emissao"]);
    expect(progresso?.etapas.filter((etapa) => !etapa.enviada)).toHaveLength(4);
    expect(ariaProgressoRegua(progresso!)).toContain("Fatura paga");
    expect(ariaProgressoRegua(progresso!)).toContain("1 de 5 etapas enviadas");
  });

  it("trata confirmada e recebida em caixa como paga, e cancelada como encerrada sem check", () => {
    expect(
      progressoDaFatura({
        status: "CONFIRMED",
        excluida: false,
        modo: "PADRAO",
        reguaId: null,
        reguas,
        envios: [],
      })?.paga,
    ).toBe(true);
    expect(
      progressoDaFatura({
        status: "RECEIVED_IN_CASH",
        excluida: false,
        modo: "PADRAO",
        reguaId: null,
        reguas,
        envios: [],
      })?.paga,
    ).toBe(true);

    const cancelada = progressoDaFatura({
      status: "RECEIVED",
      excluida: true,
      modo: "PADRAO",
      reguaId: null,
      reguas,
      envios: [{ passoId: "hoje", canal: "EMAIL", status: "ENVIADO" }],
    });
    expect(cancelada?.paga).toBe(false);
    expect(cancelada?.encerrada).toBe(true);
    expect(cancelada?.etapas.find((etapa) => etapa.id === "hoje")?.enviada).toBe(true);
    expect(cancelada?.etapas.find((etapa) => etapa.id === "atraso10")?.enviada).toBe(false);
    expect(ariaProgressoRegua(cancelada!)).toContain("Régua encerrada");
    expect(ariaProgressoRegua(cancelada!)).not.toContain("Fatura paga");
  });

  it("descreve no tooltip o nome da etapa e o canal", () => {
    expect(textoEtapa({ nome: "Lembrete 3 dias antes", enviada: false, canais: [] })).toBe(
      "Lembrete 3 dias antes · ainda não enviada",
    );
    expect(textoEtapa({ nome: "No vencimento", enviada: true, canais: ["EMAIL"] })).toBe(
      "No vencimento · enviada por e-mail",
    );
    expect(textoEtapa({ nome: "5 dias após", enviada: true, canais: ["EMAIL", "WHATSAPP"] })).toBe(
      "5 dias após · enviada por e-mail e WhatsApp",
    );
    expect(textoEtapa({ nome: "1 dia após", enviada: true, canais: ["WHATSAPP"] })).toBe(
      "1 dia após · enviada por WhatsApp",
    );
  });
});
