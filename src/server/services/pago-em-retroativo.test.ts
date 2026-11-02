import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { isoDeData } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import { type CobrancaAsaas, ErroAsaas } from "@/server/asaas/contrato";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { preencherPagoEmDaEmpresa } from "./pago-em-retroativo";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Pago", cnpj: completarCnpj("640000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Pago", cnpj: completarCnpj("640000000002") })
  ).id;
});

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
  empresa?: string;
  clienteId: string;
  status: string;
  pagamento?: string | null;
  pagoEm?: string | null;
  excluida?: boolean;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: dados.pagamento === undefined ? `pay_${randomBytes(4).toString("hex")}` : dados.pagamento,
      valor: "100.00",
      vencimento: new Date("2026-08-10T00:00:00.000Z"),
      pagoEm: dados.pagoEm ? new Date(`${dados.pagoEm}T00:00:00.000Z`) : null,
      status: dados.status,
      formaCobranca: "BOLETO",
      excluida: dados.excluida ?? false,
    },
  });
}

function cobranca(id: string, pagoEm: string | null, status = "RECEIVED"): CobrancaAsaas {
  return {
    id,
    customer: "cus_1",
    subscription: null,
    valor: "100.00",
    vencimento: "2026-08-10",
    status,
    formaCobranca: "BOLETO",
    boletoUrl: null,
    faturaUrl: null,
    descricao: null,
    excluida: false,
    pagoEm,
    referencia: null,
  };
}

function httpDas(paginas: CobrancaAsaas[][], falharCom?: ErroAsaas) {
  let chamadas = 0;
  return {
    chamadas: () => chamadas,
    http: {
      async listarCobrancas(filtro: { status?: string; offset: number; limit: number }) {
        chamadas += 1;
        if (falharCom && chamadas > 1) throw falharCom;
        const doStatus = paginas.flat().filter((item) => !filtro.status || item.status === filtro.status);
        const fatia = doStatus.slice(filtro.offset, filtro.offset + filtro.limit);
        return { cobrancas: fatia, temMais: filtro.offset + filtro.limit < doStatus.length };
      },
    },
  };
}

describe("preenchimento retroativo de pago_em", () => {
  it("grava a data do Asaas só onde está nula, sem vazar para outra empresa, e a repetição não chama o Asaas", async () => {
    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("640000000011"), "Ana Paga"));
    const bruno = await criarCliente(outraEmpresaId, dadosCliente(completarCnpj("640000000012"), "Bruno Paga"));
    const noPrazo = await fatura({ clienteId: ana.id, status: "RECEIVED", pagamento: "pay_no_prazo" });
    const atrasada = await fatura({ clienteId: ana.id, status: "RECEIVED_IN_CASH", pagamento: "pay_atrasada" });
    const jaGravada = await fatura({
      clienteId: ana.id,
      status: "RECEIVED",
      pagamento: "pay_ja",
      pagoEm: "2026-08-01",
    });
    const aberta = await fatura({ clienteId: ana.id, status: "PENDING", pagamento: "pay_aberta" });
    const semId = await fatura({ clienteId: ana.id, status: "RECEIVED", pagamento: null });
    const daOutra = await fatura({
      empresa: outraEmpresaId,
      clienteId: bruno.id,
      status: "RECEIVED",
      pagamento: "pay_no_prazo",
    });
    const remoto = httpDas([
      [
        cobranca("pay_no_prazo", "2026-08-10"),
        cobranca("pay_atrasada", "2026-08-16", "RECEIVED_IN_CASH"),
        cobranca("pay_ja", "2026-09-01"),
        cobranca("pay_aberta", "2026-08-10", "PENDING"),
      ],
    ]);

    const primeiro = await preencherPagoEmDaEmpresa(empresaId, { http: remoto.http, pausaMs: 0 });
    expect(primeiro.preenchidas).toBe(2);
    expect(primeiro.restantes).toBe(0);
    expect(isoDeData((await prisma.fatura.findUniqueOrThrow({ where: { id: noPrazo.id } })).pagoEm!)).toBe("2026-08-10");
    expect(isoDeData((await prisma.fatura.findUniqueOrThrow({ where: { id: atrasada.id } })).pagoEm!)).toBe("2026-08-16");
    expect(isoDeData((await prisma.fatura.findUniqueOrThrow({ where: { id: jaGravada.id } })).pagoEm!)).toBe("2026-08-01");
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } })).pagoEm).toBeNull();
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: semId.id } })).pagoEm).toBeNull();
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: daOutra.id } })).pagoEm).toBeNull();

    const chamadas = remoto.chamadas();
    const segundo = await preencherPagoEmDaEmpresa(empresaId, { http: remoto.http, pausaMs: 0 });
    expect(segundo.preenchidas).toBe(0);
    expect(segundo.consultas).toBe(0);
    expect(remoto.chamadas()).toBe(chamadas);
  });

  it("para no limite de taxa e deixa o restante para a próxima execução", async () => {
    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("640000000013"), "Ana Lote"));
    await fatura({ clienteId: ana.id, status: "RECEIVED", pagamento: "pay_lote_1" });
    await fatura({ clienteId: ana.id, status: "CONFIRMED", pagamento: "pay_lote_2" });
    const remoto = httpDas(
      [[cobranca("pay_lote_1", "2026-07-02")], [cobranca("pay_lote_2", "2026-07-03", "CONFIRMED")]],
      new ErroAsaas("O Asaas limitou as consultas.", 429, 12),
    );

    const resultado = await preencherPagoEmDaEmpresa(empresaId, { http: remoto.http, pausaMs: 0 });
    expect(resultado.interrompida).toBe(true);
    expect(resultado.esperaSegundos).toBe(12);
    expect(resultado.preenchidas).toBe(1);
    expect(resultado.restantes).toBe(1);
  });

  it("não inventa data quando o Asaas não devolve o dia do pagamento", async () => {
    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("640000000014"), "Ana Sem Data"));
    const faturaSemData = await fatura({ clienteId: ana.id, status: "RECEIVED", pagamento: "pay_sem_data" });
    const remoto = httpDas([[cobranca("pay_sem_data", null)]]);

    const resultado = await preencherPagoEmDaEmpresa(empresaId, { http: remoto.http, pausaMs: 0 });
    expect(resultado.preenchidas).toBe(0);
    expect(resultado.semData).toBe(1);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: faturaSemData.id } })).pagoEm).toBeNull();
  });
});
