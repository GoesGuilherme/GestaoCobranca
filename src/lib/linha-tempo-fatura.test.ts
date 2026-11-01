import { describe, expect, it } from "vitest";
import { ariaLinhaDoTempoFatura, linhaDoTempoDaFatura } from "./linha-tempo-fatura";
import type { ReguaParaProgresso } from "./regua-progresso";

const HOJE = "2026-11-01";

const reguas: ReguaParaProgresso[] = [
  {
    id: "padrao",
    padrao: true,
    nome: "Padrão",
    passos: [
      { id: "emissao", ordem: 0, naEmissao: true, dias: null, assunto: "Boleto emitido" },
      { id: "antes", ordem: 2, naEmissao: false, dias: -5, assunto: "Cinco antes", enviarWhatsapp: true },
      { id: "hoje", ordem: 1, naEmissao: false, dias: 0, assunto: "Vence hoje" },
      { id: "depois3", ordem: 4, naEmissao: false, dias: 3, assunto: "Três depois" },
      { id: "depois7", ordem: 3, naEmissao: false, dias: 7, assunto: "Sete depois" },
    ],
  },
  {
    id: "curta",
    padrao: false,
    nome: "Curta",
    passos: [
      { id: "c-emissao", ordem: 0, naEmissao: true, dias: null, assunto: "Emitida" },
      { id: "c-dois", ordem: 1, naEmissao: false, dias: 2, assunto: "Dois" },
    ],
  },
];

function linha(parcial: Parameters<typeof linhaDoTempoDaFatura>[0]) {
  return linhaDoTempoDaFatura({ modo: "PADRAO", reguas, ...parcial });
}

function acesos(resultado: ReturnType<typeof linhaDoTempoDaFatura>) {
  return resultado.marcadores.map((marco) => marco.aceso);
}

describe("linha do tempo da fatura", () => {
  it("usa os passos reais da régua padrão, sem inventar dias", () => {
    const resultado = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: HOJE,
    });
    expect(resultado.semRegua).toBe(false);
    expect(resultado.marcadores.map((marco) => marco.texto)).toEqual(["-", "05", "0", "03", "07", ""]);
    expect(resultado.marcadores.map((marco) => marco.fase)).toEqual([
      "emissao",
      "antes",
      "noDia",
      "depois",
      "depois",
      "pago",
    ]);
    expect(resultado.marcadores.map((marco) => marco.texto)).not.toContain("02");
    expect(resultado.marcadores.map((marco) => marco.texto)).not.toContain("15");
  });

  it("aguardando acende só o que já chegou", () => {
    const resultado = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: HOJE,
    });
    expect(acesos(resultado)).toEqual([true, false, false, false, false, false]);
    expect(resultado.paga).toBe(false);
    expect(resultado.marcadores[1]?.dica).toBe("5 dias antes do vencimento · E-mail e WhatsApp · futuro");
    expect(resultado.marcadores[0]?.dica).toBe("Emissão do boleto · E-mail · não enviado");
  });

  it("no dia do vencimento acende emissão, antes e o dia, e deixa o depois cinza", () => {
    const resultado = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-01",
      hoje: HOJE,
    });
    expect(acesos(resultado)).toEqual([true, true, true, false, false, false]);
    expect(resultado.marcadores[2]?.dica).toBe("No dia do vencimento · E-mail · não enviado");
    expect(resultado.marcadores[3]?.dica).toBe("3 dias depois do vencimento · E-mail · futuro");
    expect(resultado.marcadores.at(-1)?.aceso).toBe(false);
    expect(resultado.marcadores.at(-1)?.dica).toBe("Pago · em aberto");
  });

  it("vencida acende os passos cujo dia já passou e mantém o pago apagado", () => {
    const resultado = linha({
      status: "OVERDUE",
      excluida: false,
      vencimento: "2026-10-28",
      hoje: HOJE,
    });
    expect(acesos(resultado)).toEqual([true, true, true, true, false, false]);
    expect(linha({
      status: "OVERDUE",
      excluida: false,
      vencimento: "2026-10-20",
      hoje: HOJE,
    }).marcadores.map((marco) => marco.aceso)).toEqual([true, true, true, true, true, false]);
  });

  it("paga acende o check e só os passos que já ocorreram", () => {
    const atrasada = linha({
      status: "RECEIVED",
      excluida: false,
      vencimento: "2026-10-20",
      hoje: HOJE,
    });
    expect(atrasada.paga).toBe(true);
    expect(acesos(atrasada)).toEqual([true, true, true, true, true, true]);
    expect(atrasada.marcadores.at(-1)?.dica).toBe("Pago · paga");

    const cedo = linha({
      status: "RECEIVED",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: HOJE,
    });
    expect(acesos(cedo)).toEqual([true, false, false, false, false, true]);
  });

  it("envio antecipado acende o marco e marca o status como enviado", () => {
    const resultado = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: HOJE,
      envios: [
        { passoId: "antes", canal: "EMAIL", status: "ENVIADO" },
        { passoId: "antes", canal: "WHATSAPP", status: "FALHOU" },
        { passoId: "hoje", canal: "EMAIL", status: "IGNORADO" },
      ],
    });
    expect(resultado.marcadores[1]?.aceso).toBe(true);
    expect(resultado.marcadores[1]?.dica).toBe("5 dias antes do vencimento · E-mail e WhatsApp · enviado");
    expect(resultado.marcadores[2]?.aceso).toBe(false);
  });

  it("cancelada e estorno ficam neutros, com todos os marcos apagados", () => {
    const cancelada = linha({
      status: "RECEIVED",
      excluida: true,
      vencimento: "2026-10-01",
      hoje: HOJE,
      envios: [{ passoId: "emissao", canal: "EMAIL", status: "ENVIADO" }],
    });
    expect(cancelada.neutra).toBe(true);
    expect(cancelada.paga).toBe(false);
    expect(cancelada.marcadores.every((marco) => !marco.aceso)).toBe(true);
    expect(cancelada.marcadores[0]?.dica).toContain("encerrada");
    expect(cancelada.marcadores.at(-1)?.dica).toBe("Pago · encerrada");

    const estorno = linha({
      status: "REFUNDED",
      excluida: false,
      vencimento: "2026-10-01",
      hoje: HOJE,
    });
    expect(estorno.neutra).toBe(true);
    expect(estorno.marcadores.every((marco) => !marco.aceso)).toBe(true);
    expect(ariaLinhaDoTempoFatura(estorno)).toContain("apagado");
    expect(ariaLinhaDoTempoFatura(estorno)).not.toContain("aceso");
  });

  it("sem régua mostra só o pago, aceso apenas se a fatura está paga", () => {
    const aberta = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-01",
      hoje: HOJE,
      modo: "NENHUMA",
      reguaId: null,
    });
    expect(aberta.semRegua).toBe(true);
    expect(aberta.marcadores.map((marco) => marco.fase)).toEqual(["pago"]);
    expect(aberta.marcadores[0]?.aceso).toBe(false);
    expect(ariaLinhaDoTempoFatura(aberta)).toBe("Sem régua. Fatura em aberto.");

    const paga = linha({
      status: "CONFIRMED",
      excluida: false,
      vencimento: "2026-11-20",
      hoje: HOJE,
      modo: "ESPECIFICA",
      reguaId: "nao-existe",
    });
    expect(paga.semRegua).toBe(true);
    expect(paga.marcadores[0]?.aceso).toBe(true);
    expect(paga.marcadores[0]?.dica).toBe("Pago · paga");
  });

  it("régua específica não usa os dias da padrão, e faturas da mesma régua compartilham as colunas", () => {
    const especifica = linha({
      status: "PENDING",
      excluida: false,
      vencimento: "2026-11-01",
      hoje: HOJE,
      modo: "ESPECIFICA",
      reguaId: "curta",
    });
    expect(especifica.marcadores.map((marco) => marco.texto)).toEqual(["-", "02", ""]);
    expect(acesos(especifica)).toEqual([true, false, false]);

    const uma = linha({ status: "PENDING", excluida: false, vencimento: "2026-11-20", hoje: HOJE });
    const outra = linha({ status: "OVERDUE", excluida: false, vencimento: "2026-10-01", hoje: HOJE });
    expect(uma.marcadores.map((marco) => `${marco.fase}:${marco.texto}`)).toEqual(
      outra.marcadores.map((marco) => `${marco.fase}:${marco.texto}`),
    );
  });
});
