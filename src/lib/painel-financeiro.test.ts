import { describe, expect, it } from "vitest";
import {
  classificarFaturaFinanceira,
  dataProjetada,
  formatarTaxa,
  intervaloPeriodo,
  lerFiltrosPainel,
  mesesDoGrafico,
  montarPainelFinanceiro,
  taxaInadimplencia,
  type AssinaturaPainel,
  type FaturaPainel,
} from "./painel-financeiro";

const HOJE = "2026-10-27";

function fatura(parcial: Partial<FaturaPainel> & Pick<FaturaPainel, "status" | "vencimento" | "valor">): FaturaPainel {
  return {
    id: parcial.id ?? "fat-1",
    status: parcial.status,
    excluida: parcial.excluida ?? false,
    valor: parcial.valor,
    vencimento: parcial.vencimento,
    atualizadoEm: parcial.atualizadoEm ?? parcial.vencimento,
    formaCobranca: parcial.formaCobranca ?? "BOLETO",
    clienteServicoId: parcial.clienteServicoId ?? null,
    clienteId: parcial.clienteId ?? "cli-1",
    clienteNome: parcial.clienteNome ?? "Ana",
  };
}

describe("classificação financeira", () => {
  it("separa recebido, atraso, a receber e o que fica de fora", () => {
    const base = { excluida: false, hoje: HOJE };
    expect(classificarFaturaFinanceira({ ...base, status: "RECEIVED", vencimento: "2026-10-01" })).toBe("recebido");
    expect(classificarFaturaFinanceira({ ...base, status: "CONFIRMED", vencimento: "2026-10-01" })).toBe("recebido");
    expect(classificarFaturaFinanceira({ ...base, status: "RECEIVED_IN_CASH", vencimento: "2026-10-01" })).toBe(
      "recebido",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "DUNNING_RECEIVED", vencimento: "2026-09-01" })).toBe(
      "recebido",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "OVERDUE", vencimento: "2026-11-01" })).toBe("atraso");
    expect(classificarFaturaFinanceira({ ...base, status: "DUNNING_REQUESTED", vencimento: "2026-11-01" })).toBe(
      "atraso",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "PENDING", vencimento: "2026-10-26" })).toBe("atraso");
    expect(classificarFaturaFinanceira({ ...base, status: "PENDING", vencimento: "2026-10-27" })).toBe("a_receber");
    expect(classificarFaturaFinanceira({ ...base, status: "AWAITING_RISK_ANALYSIS", vencimento: "2026-10-01" })).toBe(
      "atraso",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "AWAITING_RISK_ANALYSIS", vencimento: "2026-11-02" })).toBe(
      "a_receber",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "REFUNDED", vencimento: "2026-10-01" })).toBe("fora");
    expect(classificarFaturaFinanceira({ ...base, status: "CHARGEBACK_DISPUTE", vencimento: "2026-10-01" })).toBe(
      "fora",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "PENDING", excluida: true, vencimento: "2026-10-01" })).toBe(
      "fora",
    );
    expect(classificarFaturaFinanceira({ ...base, status: "DESCONHECIDO", vencimento: "2026-10-01" })).toBe("fora");
  });

  it("calcula a taxa com uma casa e recusa total zero", () => {
    expect(taxaInadimplencia("180.00", "260.00")).toBe("69.2");
    expect(taxaInadimplencia("0.01", "0.03")).toBe("33.3");
    expect(taxaInadimplencia("0.00", "10.00")).toBe("0.0");
    expect(taxaInadimplencia("10.00", "0.00")).toBeNull();
    expect(formatarTaxa("69.2")).toBe("69,2%");
    expect(formatarTaxa(null)).toBe("—");
  });

  it("abre o gráfico em 15 meses, doze para trás e três à frente", () => {
    const meses = mesesDoGrafico("2026-10-27");
    expect(meses).toHaveLength(15);
    expect(meses[0]).toBe("2025-11");
    expect(meses[11]).toBe("2026-10");
    expect(meses[14]).toBe("2027-01");
    expect(mesesDoGrafico("2026-01-15")[0]).toBe("2025-02");
    expect(mesesDoGrafico("2026-01-15")[14]).toBe("2026-04");
    expect(intervaloPeriodo("este_mes", HOJE)).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-31",
      rotulo: "Este mês",
    });
    expect(intervaloPeriodo("mes_passado", HOJE).inicio).toBe("2026-09-01");
    expect(intervaloPeriodo("ultimos_3", HOJE).inicio).toBe("2026-08-01");
    expect(intervaloPeriodo("ultimos_12", "2026-03-04").inicio).toBe("2025-04-01");
  });

  it("não projeta mês que já tem fatura, dia passado ou mês anterior ao próximo vencimento", () => {
    const assinatura: AssinaturaPainel = {
      id: "ass-1",
      valor: "70.00",
      diaVencimento: 10,
      proximoVencimento: "2026-11-15",
      mesesComFatura: ["2026-12"],
    };
    expect(dataProjetada(assinatura, "2026-10", HOJE)).toBeNull();
    expect(dataProjetada(assinatura, "2026-11", HOJE)).toBe("2026-11-15");
    expect(dataProjetada(assinatura, "2026-12", HOJE)).toBeNull();
    expect(dataProjetada(assinatura, "2027-01", HOJE)).toBe("2027-01-10");
    expect(
      dataProjetada(
        { ...assinatura, diaVencimento: 31, proximoVencimento: null, mesesComFatura: [] },
        "2026-02",
        "2026-02-01",
      ),
    ).toBe("2026-02-28");
    expect(
      dataProjetada(
        { id: "ass-2", valor: "10.00", diaVencimento: null, proximoVencimento: null, mesesComFatura: [] },
        "2026-11",
        HOJE,
      ),
    ).toBeNull();
  });

  it("monta o painel pelo vencimento e o recebido pela atualização", () => {
    const painel = montarPainelFinanceiro({
      hoje: HOJE,
      periodo: "este_mes",
      assinaturas: [
        {
          id: "ass-1",
          valor: "70.00",
          diaVencimento: 31,
          proximoVencimento: "2026-10-31",
          mesesComFatura: ["2026-10"],
        },
        {
          id: "ass-2",
          valor: "70.00",
          diaVencimento: 10,
          proximoVencimento: "2026-11-10",
          mesesComFatura: [],
        },
      ],
      faturas: [
        fatura({ id: "1", status: "OVERDUE", vencimento: "2026-10-01", valor: "100.00", clienteNome: "Ana" }),
        fatura({ id: "2", status: "PENDING", vencimento: "2026-10-10", valor: "50.00", clienteNome: "Ana" }),
        fatura({
          id: "3",
          status: "RECEIVED",
          vencimento: "2026-09-15",
          atualizadoEm: "2026-10-05",
          valor: "200.00",
          clienteNome: "Ana",
        }),
        fatura({ id: "4", status: "PENDING", vencimento: "2026-10-30", valor: "80.00", clienteNome: "Bruno" }),
        fatura({ id: "5", status: "PENDING", vencimento: "2026-11-12", valor: "40.00", clienteNome: "Bruno" }),
        fatura({ id: "6", status: "REFUNDED", vencimento: "2026-10-08", valor: "999.00" }),
        fatura({ id: "7", status: "PENDING", excluida: true, vencimento: "2026-10-08", valor: "999.00" }),
      ],
    });

    expect(painel.emAtraso).toEqual({ valor: "150.00", quantidade: 2, diasMaisAntigo: 26 });
    expect(painel.recebido.valor).toBe("200.00");
    expect(painel.aReceber.valor).toBe("80.00");
    expect(painel.previstoProximoMes.emitido).toBe("40.00");
    expect(painel.previstoProximoMes.previsao).toBe("140.00");
    expect(painel.previstoProximoMes.total).toBe("180.00");
    expect(painel.inadimplencia).toBe("65.2");
    expect(painel.topAtraso[0]).toMatchObject({ nome: "Ana", valor: "150.00", dias: 26 });
    expect(painel.proximos.map((item) => item.vencimento)).toEqual(["2026-10-30", "2026-11-12"]);
    const outubro = painel.meses.find((mes) => mes.mes === "2026-10");
    const novembro = painel.meses.find((mes) => mes.mes === "2026-11");
    expect(outubro?.previsao).toBe("0.00");
    expect(novembro?.previsao).toBe("140.00");
    expect(outubro?.atraso).toBe("150.00");
    expect(painel.meses.find((mes) => mes.mes === "2026-09")?.recebido).toBe("200.00");
  });

  it("ignora filtro desconhecido", () => {
    expect(lerFiltrosPainel({ periodo: "ano", forma: "DINHEIRO", status: "SUMIDO" })).toEqual({
      periodo: "este_mes",
      forma: null,
      statusCliente: null,
    });
    expect(lerFiltrosPainel({ periodo: "ultimos_3", forma: "PIX", status: "BLOQUEADO" })).toEqual({
      periodo: "ultimos_3",
      forma: "PIX",
      statusCliente: "BLOQUEADO",
    });
  });
});
