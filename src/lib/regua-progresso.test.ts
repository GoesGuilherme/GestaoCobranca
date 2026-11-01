import { describe, expect, it } from "vitest";
import { ariaProgressoRegua, progressoDaFatura, textoIcone, type ReguaParaProgresso } from "./regua-progresso";

const HOJE = "2026-11-01";

const reguas: ReguaParaProgresso[] = [
  {
    id: "padrao",
    padrao: true,
    nome: "Padrão",
    passos: [
      { id: "emissao", ordem: 0, naEmissao: true, dias: null },
      { id: "antes", ordem: 1, naEmissao: false, dias: -3 },
      { id: "no-dia", ordem: 2, naEmissao: false, dias: 0 },
      { id: "atraso5", ordem: 3, naEmissao: false, dias: 5 },
    ],
  },
];

function acesos(vencimento: string, status: string, excluida = false) {
  return progressoDaFatura({ status, excluida, vencimento, hoje: HOJE }).icones.map((icone) => icone.aceso);
}

describe("quatro ícones fixos da régua", () => {
  it("antes do vencimento acende só o sino", () => {
    const progresso = progressoDaFatura({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-10",
      hoje: HOJE,
    });
    expect(progresso.icones.map((icone) => icone.id)).toEqual(["antes", "vencimento", "atraso", "pago"]);
    expect(acesos("2026-11-10", "PENDING")).toEqual([true, false, false, false]);
    expect(progresso.neutra).toBe(false);
    expect(progresso.paga).toBe(false);
  });

  it("no dia do vencimento acende o sino e o calendário", () => {
    expect(acesos("2026-11-01", "PENDING")).toEqual([true, true, false, false]);
    expect(acesos("2026-11-01", "AWAITING_RISK_ANALYSIS")).toEqual([true, true, false, false]);
  });

  it("depois do vencimento sem pagamento acende o relógio e mantém os anteriores", () => {
    expect(acesos("2026-10-20", "OVERDUE")).toEqual([true, true, true, false]);
    expect(acesos("2026-10-20", "PENDING")).toEqual([true, true, true, false]);
    expect(acesos("2026-10-20", "DUNNING_REQUESTED")).toEqual([true, true, true, false]);
  });

  it("paga antes do vencimento acende sino e check", () => {
    expect(acesos("2026-11-10", "RECEIVED")).toEqual([true, false, false, true]);
    expect(acesos("2026-11-10", "CONFIRMED")).toEqual([true, false, false, true]);
    expect(acesos("2026-11-10", "RECEIVED_IN_CASH")).toEqual([true, false, false, true]);
  });

  it("paga no dia ou depois mantém o que já aconteceu e acende o check", () => {
    expect(acesos("2026-11-01", "RECEIVED")).toEqual([true, true, false, true]);
    expect(acesos("2026-10-20", "DUNNING_RECEIVED")).toEqual([true, true, true, true]);
  });

  it("cancelada e estornada ficam com os quatro apagados", () => {
    const cancelada = progressoDaFatura({
      status: "RECEIVED",
      excluida: true,
      vencimento: "2026-10-01",
      hoje: HOJE,
    });
    expect(cancelada.neutra).toBe(true);
    expect(cancelada.paga).toBe(false);
    expect(cancelada.icones.every((icone) => !icone.aceso)).toBe(true);

    const estorno = progressoDaFatura({
      status: "REFUNDED",
      excluida: false,
      vencimento: "2026-10-01",
      hoje: HOJE,
    });
    expect(estorno.neutra).toBe(true);
    expect(estorno.icones.every((icone) => !icone.aceso)).toBe(true);
    expect(ariaProgressoRegua(estorno)).toContain("apagado");
    expect(ariaProgressoRegua(estorno)).not.toContain("aceso");
  });

  it("lista no tooltip os lembretes enviados naquele momento e o canal", () => {
    const progresso = progressoDaFatura({
      status: "OVERDUE",
      excluida: false,
      vencimento: "2026-10-20",
      hoje: HOJE,
      modo: "PADRAO",
      reguaId: null,
      reguas,
      envios: [
        { passoId: "emissao", canal: "EMAIL", status: "ENVIADO" },
        { passoId: "antes", canal: "WHATSAPP", status: "ENVIADO" },
        { passoId: "antes", canal: "EMAIL", status: "FALHOU" },
        { passoId: "no-dia", canal: "EMAIL", status: "ENVIADO" },
        { passoId: "no-dia", canal: "WHATSAPP", status: "ENVIADO" },
        { passoId: "atraso5", canal: "EMAIL", status: "IGNORADO" },
        { passoId: null, canal: "EMAIL", status: "ENVIADO" },
      ],
    });

    expect(progresso.icones[0].lembretes).toEqual([
      { nome: "Na emissão", canais: ["EMAIL"] },
      { nome: "Lembrete 3 dias antes", canais: ["WHATSAPP"] },
    ]);
    expect(progresso.icones[1].lembretes).toEqual([{ nome: "No vencimento", canais: ["EMAIL", "WHATSAPP"] }]);
    expect(progresso.icones[2].lembretes).toEqual([]);
    expect(textoIcone(progresso.icones[0], false)).toBe(
      "Antes do vencimento · Na emissão por e-mail · Lembrete 3 dias antes por WhatsApp",
    );
    expect(textoIcone(progresso.icones[1], false)).toBe("No vencimento · No vencimento por e-mail e WhatsApp");
    expect(textoIcone(progresso.icones[2], false)).toBe("Depois do vencimento");
    expect(textoIcone(progresso.icones[3], false)).toBe("Pago · ainda não");
  });

  it("não depende da régua para acender e descreve o ícone apagado", () => {
    const progresso = progressoDaFatura({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-10",
      hoje: HOJE,
      modo: "NENHUMA",
      reguaId: null,
      reguas,
      envios: [{ passoId: "antes", canal: "EMAIL", status: "ENVIADO" }],
    });
    expect(progresso.icones[0].aceso).toBe(true);
    expect(progresso.icones[0].lembretes).toEqual([]);
    expect(textoIcone(progresso.icones[1], false)).toBe("No vencimento · ainda não");
    expect(ariaProgressoRegua(progresso)).toContain("Antes do vencimento, aceso");
  });
});
