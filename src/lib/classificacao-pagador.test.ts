import { describe, expect, it } from "vitest";
import {
  ATRASO_MEDIO_MAX_REGULAR_DIAS,
  DIAS_VENCIDA_ABERTO_GRAVE,
  FRACAO_MAX_COM_ATRASO_REGULAR,
  JANELA_MESES,
  MAX_VENCIDAS_ABERTO_REGULAR,
  MINIMO_ATRASOS_PARA_FREQUENCIA,
  MINIMO_FATURAS,
  TOLERANCIA_DIAS,
  classificarPagador,
  inicioDaJanela,
  type FaturaParaClassificar,
} from "./classificacao-pagador";

const HOJE = "2026-11-01";

function paga(
  vencimento: string,
  pagoEm: string | null = vencimento,
  status = "RECEIVED",
): FaturaParaClassificar {
  return { vencimento, pagoEm, status, excluida: false };
}

function aberta(vencimento: string, status = "OVERDUE"): FaturaParaClassificar {
  return { vencimento, pagoEm: null, status, excluida: false };
}

describe("classificação de pagador", () => {
  it("documenta os limites ajustáveis", () => {
    expect(JANELA_MESES).toBe(12);
    expect(MINIMO_FATURAS).toBe(2);
    expect(TOLERANCIA_DIAS).toBe(0);
    expect(ATRASO_MEDIO_MAX_REGULAR_DIAS).toBe(10);
    expect(FRACAO_MAX_COM_ATRASO_REGULAR).toBe(0.3);
    expect(MINIMO_ATRASOS_PARA_FREQUENCIA).toBe(2);
    expect(MAX_VENCIDAS_ABERTO_REGULAR).toBe(1);
    expect(DIAS_VENCIDA_ABERTO_GRAVE).toBe(15);
    expect(inicioDaJanela("2026-11-01")).toBe("2025-11-01");
    expect(inicioDaJanela("2026-03-31", 1)).toBe("2026-02-28");
    expect(inicioDaJanela("2024-03-31", 1)).toBe("2024-02-29");
  });

  it("é bom pagador quando todas as faturas da janela foram pagas até o vencimento", () => {
    const resultado = classificarPagador(
      [
        paga("2026-08-10", "2026-08-01"),
        paga("2026-09-10", "2026-09-10"),
        paga("2026-10-10", "2026-10-10", "CONFIRMED"),
        paga("2026-11-02", "2026-10-20"),
        aberta(HOJE, "PENDING"),
      ],
      HOJE,
    );
    expect(resultado?.classificacao).toBe("bom");
    expect(resultado?.rotulo).toBe("Bom pagador");
    expect(resultado?.tooltip).toBe("Pagou em dia as 3 faturas dos últimos 12 meses.");
  });

  it("pagar no dia conta como em dia e um dia depois já é atraso", () => {
    expect(classificarPagador([paga("2026-09-10", "2026-09-10"), paga("2026-10-10", "2026-10-10")], HOJE)?.classificacao).toBe(
      "bom",
    );
    const umDia = classificarPagador([paga("2026-09-10", "2026-09-10"), paga("2026-10-10", "2026-10-11")], HOJE);
    expect(umDia?.classificacao).toBe("regular");
    expect(umDia?.comAtraso).toBe(1);
    expect(umDia?.mediaAtrasoDias).toBe(1);
    expect(umDia?.tooltip).toBe("1 de 2 faturas com atraso, média 1 dia.");
  });

  it("não classifica com menos de duas faturas com desfecho", () => {
    expect(classificarPagador([], HOJE)).toBeNull();
    expect(classificarPagador([paga("2026-10-10")], HOJE)).toBeNull();
    expect(classificarPagador([aberta("2026-10-20")], HOJE)).toBeNull();
    expect(classificarPagador([paga("2026-10-10"), paga("2026-10-20", null)], HOJE)).toBeNull();
  });

  it("trata atraso leve e ocasional como pagador regular", () => {
    const faturas = [
      paga("2026-01-10", "2026-01-10"),
      paga("2026-02-10", "2026-02-10"),
      paga("2026-03-10", "2026-03-10"),
      paga("2026-04-10", "2026-04-10"),
      paga("2026-05-10", "2026-05-10"),
      paga("2026-06-10", "2026-06-10"),
      paga("2026-07-10", "2026-07-10"),
      paga("2026-08-10", "2026-08-15"),
      paga("2026-09-10", "2026-09-16"),
      paga("2026-10-10", "2026-10-17"),
    ];
    const resultado = classificarPagador(faturas, HOJE);
    expect(resultado?.classificacao).toBe("regular");
    expect(resultado?.rotulo).toBe("Pagador regular");
    expect(resultado?.tooltip).toBe("3 de 10 faturas com atraso, média 6 dias.");
  });

  it("aceita no máximo uma vencida em aberto há menos de 15 dias", () => {
    const leve = classificarPagador([paga("2026-08-10"), paga("2026-09-10"), aberta("2026-10-18")], HOJE);
    expect(leve?.classificacao).toBe("regular");
    expect(leve?.tooltip).toBe("1 fatura vencida em aberto há 14 dias.");

    const grave = classificarPagador([paga("2026-08-10"), paga("2026-09-10"), aberta("2026-10-17", "PENDING")], HOJE);
    expect(grave?.classificacao).toBe("mau");
    expect(grave?.tooltip).toBe("1 fatura vencida em aberto há 15 dias.");
  });

  it("é mau pagador com atraso frequente, atraso longo ou duas vencidas em aberto", () => {
    const frequentes = Array.from({ length: 10 }, (_, indice) => {
      const mes = String(indice + 1).padStart(2, "0");
      const vencimento = `2026-${mes}-10`;
      const pagoEm = indice < 4 ? `2026-${mes}-12` : vencimento;
      return paga(vencimento, pagoEm);
    });
    expect(classificarPagador(frequentes, HOJE)?.classificacao).toBe("mau");
    expect(classificarPagador(frequentes, HOJE)?.tooltip).toBe("4 de 10 faturas com atraso, média 2 dias.");

    const longo = classificarPagador(
      [paga("2026-08-10", "2026-09-09"), paga("2026-09-10"), paga("2026-10-10")],
      HOJE,
    );
    expect(longo?.classificacao).toBe("mau");
    expect(longo?.mediaAtrasoDias).toBe(30);

    const duas = classificarPagador([aberta("2026-10-30"), aberta("2026-10-31", "DUNNING_REQUESTED")], HOJE);
    expect(duas?.classificacao).toBe("mau");
    expect(duas?.rotulo).toBe("Mau pagador");
    expect(duas?.tooltip).toBe("2 faturas vencidas em aberto, a mais antiga há 2 dias.");
  });

  it("não trata um único atraso curto como frequente e mantém a média de 10 dias no regular", () => {
    const unico = classificarPagador([paga("2026-09-10", "2026-09-13"), paga("2026-10-10")], HOJE);
    expect(unico?.classificacao).toBe("regular");

    const noLimite = classificarPagador(
      [
        paga("2026-01-10", "2026-01-20"),
        paga("2026-02-10", "2026-02-20"),
        paga("2026-03-10", "2026-03-20"),
        paga("2026-04-10"),
        paga("2026-05-10"),
        paga("2026-06-10"),
        paga("2026-07-10"),
        paga("2026-08-10"),
        paga("2026-09-10"),
        paga("2026-10-10"),
      ],
      HOJE,
    );
    expect(noLimite?.classificacao).toBe("regular");
    expect(noLimite?.mediaAtrasoDias).toBe(10);

    const passa = classificarPagador(
      [
        paga("2026-01-10"),
        paga("2026-02-10"),
        paga("2026-03-10"),
        paga("2026-04-10"),
        paga("2026-05-10"),
        paga("2026-06-10"),
        paga("2026-07-10"),
        paga("2026-08-10", "2026-08-20"),
        paga("2026-09-10", "2026-09-21"),
        paga("2026-10-10"),
      ],
      HOJE,
    );
    expect(passa?.classificacao).toBe("mau");
    expect(passa?.mediaAtrasoDias).toBe(11);
  });

  it("ignora canceladas, estornadas, rascunhos e o que está fora da janela", () => {
    const resultado = classificarPagador(
      [
        paga("2026-09-10"),
        paga("2026-10-10", "2026-10-10", "DUNNING_RECEIVED"),
        paga("2026-07-10", "2026-08-20", "REFUNDED"),
        { ...paga("2026-06-10", "2026-07-20"), status: "CHARGEBACK_DISPUTE" },
        { ...aberta("2026-05-01"), excluida: true },
        aberta("2026-04-01", "CRIANDO"),
        aberta("2026-04-02", "ERRO_EMISSAO"),
        paga("2025-10-31"),
        paga("2025-11-01", null),
      ],
      HOJE,
    );
    expect(resultado?.classificacao).toBe("bom");
    expect(resultado?.pagas).toBe(2);
  });

  it("conta a fatura no primeiro dia da janela e deixa a data de hoje inválida sem selo", () => {
    expect(classificarPagador([paga("2025-11-01"), paga("2026-10-01")], HOJE)?.classificacao).toBe("bom");
    expect(classificarPagador([paga("2025-10-31"), paga("2025-10-30")], HOJE)).toBeNull();
    expect(classificarPagador([paga("2026-10-01"), paga("2026-10-02")], "ontem")).toBeNull();
  });
});
