import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { middleware } from "@/middleware";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { destinoAbaFinanceiro } from "@/lib/rotas-dashboard";
import { obterPainelFinanceiro } from "./painel-financeiro-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const AGORA = new Date("2026-10-27T15:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Empresa Painel", cnpj: completarCnpj("610000000001") })
  ).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Painel", cnpj: completarCnpj("610000000002") })
  ).id;
});

function autor(papel: "DONO" | "FINANCEIRO" | "SUPORTE", id = empresaId) {
  return { empresaId: id, papel };
}

function dadosCliente(documento: string, nome: string, status: "ATIVO" | "BLOQUEADO" = "ATIVO") {
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
    status,
  };
}

async function fatura(dados: {
  clienteId: string;
  valor: string;
  vencimento: string;
  status: string;
  forma?: string;
  excluida?: boolean;
  clienteServicoId?: string;
  empresa?: string;
  pagoEm?: string | null;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      clienteServicoId: dados.clienteServicoId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: dados.valor,
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      pagoEm: dados.pagoEm ? new Date(`${dados.pagoEm}T00:00:00.000Z`) : null,
      status: dados.status,
      formaCobranca: dados.forma ?? "BOLETO",
      excluida: dados.excluida ?? false,
    },
  });
}

describe("painel financeiro", () => {
  it("soma só a empresa da sessão e separa atraso, recebido, a receber e previsão", async () => {
    await expect(obterPainelFinanceiro(autor("SUPORTE"), { periodo: "este_mes", forma: null, statusCliente: null })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });

    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("610000000011"), "Ana Mercado"));
    const bruno = await criarCliente(empresaId, dadosCliente(completarCnpj("610000000012"), "Bruno Padaria", "BLOQUEADO"));
    const servico = await prisma.servico.create({
      data: { empresaId, nome: "Mensalidade", precoPadrao: "70.00", ativo: true },
    });
    const assinatura = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId: ana.id,
        servicoId: servico.id,
        valor: "70.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-01-10T00:00:00.000Z"),
        status: "ATIVO",
        asaasSubscriptionId: `sub_${randomBytes(4).toString("hex")}`,
        asaasAssinaturaStatus: "ACTIVE",
        formaCobrancaRecorrente: "BOLETO",
        diaVencimento: 10,
        proximoVencimento: new Date("2026-11-10T00:00:00.000Z"),
      },
    });
    const outraCliente = await criarCliente(outraEmpresaId, dadosCliente(completarCnpj("610000000013"), "Fora da Empresa"));

    await fatura({ clienteId: ana.id, valor: "100.00", vencimento: "2026-10-10", status: "OVERDUE", clienteServicoId: assinatura.id });
    await fatura({ clienteId: ana.id, valor: "50.00", vencimento: "2026-10-01", status: "PENDING" });
    const recebida = await fatura({
      clienteId: ana.id,
      valor: "200.00",
      vencimento: "2026-09-15",
      status: "RECEIVED",
      forma: "PIX",
      pagoEm: "2026-10-05",
    });
    await prisma.$executeRaw`UPDATE faturas SET atualizado_em = ${new Date("2026-11-02T15:00:00.000Z")} WHERE id = ${recebida.id}`;
    await fatura({ clienteId: ana.id, valor: "80.00", vencimento: "2026-10-30", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "40.00", vencimento: "2026-11-12", status: "PENDING" });
    await fatura({ clienteId: ana.id, valor: "999.00", vencimento: "2026-10-08", status: "REFUNDED" });
    await fatura({ clienteId: ana.id, valor: "999.00", vencimento: "2026-10-08", status: "PENDING", excluida: true });
    await fatura({ clienteId: bruno.id, valor: "30.00", vencimento: "2026-10-02", status: "OVERDUE" });
    await fatura({
      clienteId: outraCliente.id,
      valor: "500.00",
      vencimento: "2026-10-02",
      status: "OVERDUE",
      empresa: outraEmpresaId,
    });

    const painel = await obterPainelFinanceiro(autor("FINANCEIRO"), {
      periodo: "este_mes",
      forma: null,
      statusCliente: null,
    }, AGORA);

    expect(painel.emAtraso).toEqual({ valor: "180.00", quantidade: 3, diasMaisAntigo: 26 });
    expect(painel.recebido.valor).toBe("200.00");
    expect(painel.aReceber.valor).toBe("80.00");
    expect(painel.previstoProximoMes).toMatchObject({ emitido: "40.00", previsao: "70.00", total: "110.00", mes: "2026-11" });
    expect(painel.inadimplencia).toBe("69.2");
    expect(painel.topAtraso.map((item) => item.nome)).toEqual(["Ana Mercado", "Bruno Padaria"]);
    expect(painel.proximos.map((item) => item.vencimento)).toEqual(["2026-10-30", "2026-11-12"]);
    expect(painel.meses.find((mes) => mes.mes === "2026-10")?.previsao).toBe("0.00");
    expect(painel.meses.find((mes) => mes.mes === "2026-11")?.previsao).toBe("70.00");
    expect(painel.meses.find((mes) => mes.mes === "2026-12")?.previsao).toBe("70.00");

    const soAtivos = await obterPainelFinanceiro(autor("DONO"), {
      periodo: "este_mes",
      forma: null,
      statusCliente: "ATIVO",
    }, AGORA);
    expect(soAtivos.emAtraso.valor).toBe("150.00");
    expect(soAtivos.topAtraso.map((item) => item.nome)).toEqual(["Ana Mercado"]);

    const soBoleto = await obterPainelFinanceiro(autor("DONO"), {
      periodo: "este_mes",
      forma: "BOLETO",
      statusCliente: null,
    }, AGORA);
    expect(soBoleto.recebido.valor).toBe("0.00");
    expect(soBoleto.emAtraso.valor).toBe("180.00");
  });

  it("não conta em novembro pagamento de outubro atualizado pelo backfill, e usa atualizado_em se pago_em for nulo", async () => {
    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("610000000021"), "Ana Caixa"));
    const agora = new Date("2026-11-02T15:00:00.000Z");
    const filtros = { periodo: "este_mes" as const, forma: null, statusCliente: null };

    const outubro = await fatura({
      clienteId: ana.id,
      valor: "1000.00",
      vencimento: "2024-06-01",
      status: "RECEIVED",
      pagoEm: "2026-10-20",
    });
    const novembro = await fatura({
      clienteId: ana.id,
      valor: "300.00",
      vencimento: "2024-06-01",
      status: "RECEIVED",
      pagoEm: "2026-11-01",
    });
    const semData = await fatura({
      clienteId: ana.id,
      valor: "40.00",
      vencimento: "2026-09-05",
      status: "RECEIVED",
      pagoEm: null,
    });
    const semDataOutubro = await fatura({
      clienteId: ana.id,
      valor: "80.00",
      vencimento: "2026-08-05",
      status: "DUNNING_RECEIVED",
      pagoEm: null,
    });
    const noPrazoDoMes = await fatura({
      clienteId: ana.id,
      valor: "700.00",
      vencimento: "2026-10-10",
      status: "RECEIVED",
      pagoEm: "2026-10-10",
    });
    await prisma.$executeRaw`
      UPDATE faturas SET atualizado_em = ${new Date("2026-11-02T15:00:00.000Z")}
      WHERE id IN (${outubro.id}, ${novembro.id}, ${semData.id}, ${noPrazoDoMes.id})
    `;
    await prisma.$executeRaw`
      UPDATE faturas SET atualizado_em = ${new Date("2026-10-20T15:00:00.000Z")}
      WHERE id = ${semDataOutubro.id}
    `;

    const painel = await obterPainelFinanceiro(autor("FINANCEIRO"), filtros, agora);
    expect(painel.recebido.valor).toBe("340.00");
    expect(painel.meses.find((mes) => mes.mes === "2026-10")?.recebido).toBe("700.00");

    const passado = await obterPainelFinanceiro(
      autor("DONO"),
      { periodo: "mes_passado", forma: null, statusCliente: null },
      agora,
    );
    expect(passado.recebido.valor).toBe("1780.00");
  });

  it("o suporte recebe 403 na página e o financeiro entra", async () => {
    const suporte = await emitirToken({
      sub: "usuario-suporte",
      email: "suporte@exemplo.test",
      nome: "Suporte",
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
    });
    const pedido = new NextRequest("http://127.0.0.1/painel-financeiro", {
      headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
    });
    expect((await middleware(pedido)).status).toBe(403);
    const aba = new NextRequest("http://127.0.0.1/dashboards/financeiro", {
      headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
    });
    expect((await middleware(aba)).status).toBe(403);
    const painel = new NextRequest("http://127.0.0.1/dashboards/painel", {
      headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
    });
    expect((await middleware(painel)).status).toBe(200);
    const api = new NextRequest("http://127.0.0.1/api/painel-financeiro", {
      headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
    });
    expect((await middleware(api)).status).toBe(403);

    const financeiro = await emitirToken({
      sub: "usuario-financeiro",
      email: "financeiro@exemplo.test",
      nome: "Financeiro",
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
    });
    const antigo = await middleware(
      new NextRequest("http://127.0.0.1/painel-financeiro?periodo=ultimos_3&forma=PIX", {
        headers: { cookie: `${COOKIE_SESSAO}=${financeiro}`, host: "127.0.0.1:3000" },
      }),
    );
    expect(antigo.status).toBe(200);
    expect(destinoAbaFinanceiro({ periodo: "ultimos_3", forma: "PIX" })).toBe(
      "/dashboards/financeiro?periodo=ultimos_3&forma=PIX",
    );
    expect(destinoAbaFinanceiro({})).toBe("/dashboards/financeiro");
    const liberado = await middleware(
      new NextRequest("http://127.0.0.1/dashboards/financeiro", {
        headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` },
      }),
    );
    expect(liberado.status).toBe(200);
  });
});