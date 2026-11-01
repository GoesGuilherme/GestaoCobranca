import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { obterBocaJacare } from "./boca-jacare-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const AGORA = new Date("2026-10-27T15:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Boca", cnpj: completarCnpj("620000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Boca", cnpj: completarCnpj("620000000002") })
  ).id;
});

function autor(papel: "DONO" | "FINANCEIRO" | "SUPORTE", id = empresaId) {
  return { empresaId: id, papel };
}

function dadosCliente(documento: string, nome: string) {
  return {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: `${nome.toLowerCase().replace(/ /g, ".")}@exemplo.test`,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function fatura(dados: {
  clienteId: string;
  valor: string;
  vencimento: string;
  status: string;
  excluida?: boolean;
  empresa?: string;
  pagamento?: string | null;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: dados.pagamento === undefined ? `pay_${randomBytes(4).toString("hex")}` : dados.pagamento,
      valor: dados.valor,
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      status: dados.status,
      formaCobranca: "BOLETO",
      excluida: dados.excluida ?? false,
    },
  });
}

describe("consulta da boca de jacaré", () => {
  it("agrega só a empresa da sessão e separa vencido de ainda não vencido", async () => {
    await expect(obterBocaJacare(autor("SUPORTE"), 12, AGORA)).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });

    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("620000000011"), "Ana Mercado"));
    const fora = await criarCliente(outraEmpresaId, dadosCliente(completarCnpj("620000000012"), "Fora da Empresa"));

    await fatura({ clienteId: ana.id, valor: "200.00", vencimento: "2026-09-10", status: "RECEIVED" });
    await fatura({ clienteId: ana.id, valor: "100.00", vencimento: "2026-09-05", status: "OVERDUE" });
    await fatura({ clienteId: ana.id, valor: "25.00", vencimento: "2026-09-20", status: "AWAITING_RISK_ANALYSIS" });
    await fatura({ clienteId: ana.id, valor: "999.00", vencimento: "2026-09-01", status: "REFUNDED" });
    await fatura({ clienteId: ana.id, valor: "999.00", vencimento: "2026-09-02", status: "PENDING", excluida: true });
    await fatura({ clienteId: ana.id, valor: "999.00", vencimento: "2026-09-03", status: "CRIANDO", pagamento: null });
    await fatura({ clienteId: ana.id, valor: "50.00", vencimento: "2026-10-01", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "80.00", vencimento: "2026-10-27", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "40.00", vencimento: "2026-10-30", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "30.00", vencimento: "2026-10-10", status: "RECEIVED" });
    await fatura({ clienteId: ana.id, valor: "15.00", vencimento: "2026-10-20", status: "DUNNING_REQUESTED" });
    await fatura({ clienteId: ana.id, valor: "40.00", vencimento: "2026-07-01", status: "CHARGEBACK_DISPUTE" });
    await fatura({ clienteId: ana.id, valor: "10.00", vencimento: "2026-08-15", status: "CONFIRMED" });
    await fatura({ clienteId: ana.id, valor: "40.00", vencimento: "2026-11-12", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "15.00", vencimento: "2026-11-05", status: "OVERDUE" });
    await fatura({ clienteId: ana.id, valor: "70.00", vencimento: "2024-01-10", status: "OVERDUE" });
    await fatura({
      clienteId: fora.id,
      valor: "500.00",
      vencimento: "2026-10-02",
      status: "OVERDUE",
      empresa: outraEmpresaId,
    });

    const grafico = await obterBocaJacare(autor("FINANCEIRO"), 12, AGORA);

    expect(grafico.hoje).toBe("2026-10-27");
    expect(grafico.meses).toHaveLength(12);
    expect(grafico.meses[0]?.mes).toBe("2025-11");
    expect(grafico.meses.at(-1)?.mes).toBe("2026-10");
    expect(grafico.meses.find((mes) => mes.mes === "2026-09")).toMatchObject({
      situacao: "fechado",
      faturado: "325.00",
      recebido: "200.00",
      inadimplente: "125.00",
      aVencer: "0.00",
      taxa: "38.4",
    });
    expect(grafico.meses.find((mes) => mes.mes === "2026-10")).toMatchObject({
      situacao: "parcial",
      faturado: "215.00",
      recebido: "30.00",
      inadimplente: "65.00",
      aVencer: "120.00",
      taxa: "30.2",
    });
    expect(grafico.meses.find((mes) => mes.mes === "2026-08")).toMatchObject({
      faturado: "10.00",
      recebido: "10.00",
      inadimplente: "0.00",
      taxa: "0.0",
    });
    expect(grafico.meses.find((mes) => mes.mes === "2026-07")?.faturado).toBe("0.00");
    expect(grafico.meses.some((mes) => mes.mes === "2026-11")).toBe(false);
    expect(grafico.resumo).toEqual({
      inadimplente: "275.00",
      base: "515.00",
      taxa: "53.3",
      foraDoGrafico: true,
    });

    const curto = await obterBocaJacare(autor("DONO"), 6, AGORA);
    expect(curto.meses.map((mes) => mes.mes)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(curto.resumo.inadimplente).toBe("275.00");
  });
});
