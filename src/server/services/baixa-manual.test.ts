import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { statusEh } from "@/lib/status-pagamento";
import { AsaasMemoria } from "@/server/asaas/memoria";
import type { CobrancaAsaas } from "@/server/asaas/contrato";
import { CoraMemoria } from "@/server/cora/memoria";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { darBaixaManual } from "./baixa-manual";
import { limparLimiteWebhookCora } from "./cora-webhook-service";
import { processarWebhookCora } from "./cora-webhook-service";
import { processarWebhookAsaas } from "./asaas-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ASAAS_MOCK;
delete process.env.TWILIO_MOCK;

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const AGORA = new Date("2026-11-20T15:00:00.000Z");

function autor(empresaId: string, papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO") {
  return { empresaId, papel, usuarioId: "usuario-baixa", email: "dono@exemplo.test", nomeEmpresa: "Collab" };
}

function entrada(parcial: Partial<{ pagoEm: string; valorRecebido: string; forma: string; nota: string; enviarConfirmacao: boolean }> = {}) {
  return {
    pagoEm: "2026-11-20",
    valorRecebido: "350.00",
    forma: "PIX",
    nota: "Pix na conta Cora",
    enviarConfirmacao: false,
    ...parcial,
  };
}

function cobrancaAsaas(id: string, subscription: string | null = null): CobrancaAsaas & {
  encargos: { multaPercentual: null; jurosPercentual: null; descontoPercentual: null; descontoDiasAntes: null };
} {
  return {
    id,
    customer: "cus_baixa",
    subscription,
    valor: "350.00",
    vencimento: "2026-11-10",
    status: "PENDING",
    formaCobranca: "BOLETO",
    boletoUrl: "https://sandbox.asaas.com/b/pdf/" + id,
    faturaUrl: "https://sandbox.asaas.com/i/" + id,
    descricao: "Novembro",
    excluida: false,
    pagoEm: null,
    referencia: null,
    encargos: { multaPercentual: null, jurosPercentual: null, descontoPercentual: null, descontoDiasAntes: null },
  };
}

describe("baixa manual", () => {
  let empresaId = "";
  let vizinhaId = "";
  let clienteId = "";

  beforeAll(() => {
    process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.ASAAS_MOCK;
    delete process.env.TWILIO_MOCK;
  });

  beforeEach(async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Collab Software", cnpj: completarCnpj("880000000001") });
    const vizinha = await criarEmpresaDeTeste({ nomeFantasia: "Vizinha", cnpj: completarCnpj("880000000002") });
    empresaId = empresa.id;
    vizinhaId = vizinha.id;
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Mini Marcket of Joy",
        razaoSocial: "Mini Marcket of Joy Ltda",
        documento: completarCnpj("880000000003"),
        tipoDocumento: "CNPJ",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: "mini@exemplo.test",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
      },
    });
    clienteId = cliente.id;
  });

  async function fatura(dados: {
    provedor?: "ASAAS" | "CORA" | "INTER" | "PIX_DIRETO";
    status?: string;
    statusNormalizado?: string;
    pagamento?: string | null;
    idExterno?: string | null;
    clienteServicoId?: string | null;
    valor?: string;
  } = {}) {
    const provedor = dados.provedor ?? "ASAAS";
    return prisma.fatura.create({
      data: {
        empresaId,
        clienteId,
        clienteServicoId: dados.clienteServicoId ?? null,
        provedor,
        asaasPaymentId: provedor === "ASAAS" ? (dados.pagamento === undefined ? "pay_baixa" : dados.pagamento) : null,
        idExterno: dados.idExterno === undefined ? (provedor === "ASAAS" ? "pay_baixa" : null) : dados.idExterno,
        valor: dados.valor ?? "350.00",
        vencimento: new Date("2026-11-10T00:00:00.000Z"),
        status: dados.status ?? "OVERDUE",
        statusNormalizado: dados.statusNormalizado ?? "VENCIDO",
        formaCobranca: "BOLETO",
        descricao: "Mensalidade de novembro",
      },
    });
  }

  it("confirma no Asaas fora da transação, grava a auditoria e não avisa o cliente", async () => {
    await salvarConfiguracaoAsaas(autor(empresaId), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const servico = await prisma.servico.create({
      data: { empresaId, nome: "Mensalidade", precoPadrao: "350.00" },
    });
    const vinculo = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId,
        servicoId: servico.id,
        valor: "350.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-01-10T00:00:00.000Z"),
        status: "ATIVO",
        asaasSubscriptionId: "sub_baixa",
        asaasAssinaturaStatus: "ACTIVE",
        provedorRecorrente: "ASAAS",
        diaVencimento: 10,
        proximoVencimento: new Date("2026-12-10T00:00:00.000Z"),
      },
    });
    const aberta = await fatura({ clienteServicoId: vinculo.id });
    const seguinte = await fatura({
      pagamento: "pay_dezembro",
      idExterno: "pay_dezembro",
      status: "PENDING",
      statusNormalizado: "PENDENTE",
      clienteServicoId: vinculo.id,
    });
    const memoria = new AsaasMemoria("baixa");
    memoria.cobrancas.set("pay_baixa", cobrancaAsaas("pay_baixa", "sub_baixa"));
    memoria.cobrancas.set("pay_dezembro", cobrancaAsaas("pay_dezembro", "sub_baixa"));

    let dentro = false;
    const original = prisma.$transaction.bind(prisma);
    prisma.$transaction = (async (fn: unknown, opcoes?: unknown) => {
      if (typeof fn !== "function") return original(fn as never, opcoes as never);
      dentro = true;
      try {
        return await original(fn as never, opcoes as never);
      } finally {
        dentro = false;
      }
    }) as typeof prisma.$transaction;
    memoria.receberEmDinheiro = async (id, dados) => {
      if (dentro) throw new Error("HTTP dentro da transação");
      return AsaasMemoria.prototype.receberEmDinheiro.call(memoria, id, dados);
    };

    try {
      await expect(darBaixaManual(autor(empresaId, "SUPORTE"), aberta.id, entrada(), { agora: AGORA, asaas: memoria })).rejects.toMatchObject({
        status: 403,
      });
      await expect(darBaixaManual(autor(vizinhaId), aberta.id, entrada(), { agora: AGORA, asaas: memoria })).rejects.toMatchObject({
        status: 409,
      });
      const resultado = await darBaixaManual(autor(empresaId, "FINANCEIRO"), aberta.id, entrada({ valorRecebido: "300.00" }), {
        agora: AGORA,
        asaas: memoria,
      });
      expect(resultado.aviso).toBeNull();
      expect(resultado.fatura.status).toBe("RECEIVED_IN_CASH");
      expect(resultado.fatura.pagoEm).toBe("2026-11-20");
      expect(resultado.fatura.valor).toBe("350.00");
    } finally {
      prisma.$transaction = original;
    }

    expect(memoria.recebimentosEmDinheiro).toEqual([
      { id: "pay_baixa", pagamentoEm: "2026-11-20", valor: "300.00", notifyCustomer: false },
    ]);
    expect(memoria.cobrancas.get("pay_dezembro")?.status).toBe("PENDING");
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } });
    expect(gravada.statusNormalizado).toBe("PAGO");
    expect(statusEh(gravada.status, "REGUA_ABERTA", "ASAAS")).toBe(false);
    expect(gravada.baixaManualEm).toBeTruthy();
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: aberta.id, empresaId } });
    expect(baixa.origem).toBe("MANUAL");
    expect(baixa.formaRecebimento).toBe("PIX");
    expect(baixa.valorRecebido?.toFixed(2)).toBe("300.00");
    expect(baixa.usuarioId).toBe("usuario-baixa");
    expect(baixa.pagoEm.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(baixa.efeitoBanco).toBe("ASAAS_RECEBIDO_EM_DINHEIRO");
    expect(baixa.nota).toBe("Pix na conta Cora");
    expect(await prisma.conciliacaoPagamento.count({ where: { faturaId: aberta.id } })).toBe(1);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: aberta.id, tipo: "PAGO" } })).toBe(0);
    const recorrencia = await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } });
    expect(recorrencia.proximoVencimento?.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(recorrencia.asaasAssinaturaStatus).toBe("ACTIVE");
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: seguinte.id } })).status).toBe("PENDING");
  });

  it("não marca localmente quando o Asaas recusa", async () => {
    await salvarConfiguracaoAsaas(autor(empresaId), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const aberta = await fatura();
    const memoria = new AsaasMemoria("falha");
    memoria.cobrancas.set("pay_baixa", cobrancaAsaas("pay_baixa"));
    memoria.receberEmDinheiroLanca = true;
    await expect(darBaixaManual(autor(empresaId), aberta.id, entrada(), { agora: AGORA, asaas: memoria })).rejects.toMatchObject({
      status: 502,
    });
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } });
    expect(gravada.status).toBe("OVERDUE");
    expect(gravada.statusNormalizado).toBe("VENCIDO");
    expect(gravada.baixaManualEm).toBeNull();
    expect(await prisma.conciliacaoPagamento.count({ where: { faturaId: aberta.id } })).toBe(0);
  });

  it("trata o webhook RECEIVED_IN_CASH sem baixar de novo nem avisar", async () => {
    const config = await salvarConfiguracaoAsaas(autor(empresaId), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const aberta = await fatura();
    const memoria = new AsaasMemoria("hook");
    memoria.cobrancas.set("pay_baixa", cobrancaAsaas("pay_baixa"));
    await darBaixaManual(autor(empresaId), aberta.id, entrada({ enviarConfirmacao: true }), { agora: AGORA, asaas: memoria });
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: aberta.id, tipo: "PAGO" } })).toBe(1);

    const evento = (id: string) => ({
      id,
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_baixa",
        customer: "cus_baixa",
        value: 350,
        dueDate: "2026-11-10",
        status: "RECEIVED_IN_CASH",
        billingType: "BOLETO",
        clientPaymentDate: "2026-11-20",
        deleted: false,
      },
    });
    const primeiro = await processarWebhookAsaas(config.tokenWebhook, evento("evt_cash_1"));
    const repetido = await processarWebhookAsaas(config.tokenWebhook, evento("evt_cash_1"));
    const outro = await processarWebhookAsaas(config.tokenWebhook, evento("evt_cash_2"));
    expect(primeiro.duplicado).toBe(false);
    expect(repetido.duplicado).toBe(true);
    expect(outro.duplicado).toBe(false);
    expect(await prisma.conciliacaoPagamento.count({ where: { faturaId: aberta.id } })).toBe(1);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: aberta.id, tipo: "PAGO" } })).toBe(1);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } })).status).toBe("RECEIVED_IN_CASH");
  });

  it("cancela o boleto na Cora e mantém a fatura paga se o webhook de cancelamento chegar", async () => {
    const aberta = await fatura({
      provedor: "CORA",
      status: "OPEN",
      statusNormalizado: "PENDENTE",
      pagamento: null,
      idExterno: "inv_baixa",
    });
    const memoria = new CoraMemoria();
    memoria.faturas.set("inv_baixa", {
      id: "inv_baixa",
      status: "OPEN",
      valor: "350.00",
      valorPago: "0.00",
      vencimento: "2026-11-10",
      pagoEm: null,
      codigo: "fat",
      linhaDigitavel: null,
      codigoBarras: null,
      boletoUrl: null,
      pixCopiaCola: null,
      descricao: null,
      metodo: "BANK_SLIP",
    });
    const resultado = await darBaixaManual(autor(empresaId), aberta.id, entrada(), { agora: AGORA, cora: memoria });
    expect(resultado.aviso).toMatch(/cancelado na Cora/);
    expect(resultado.fatura.status).toBe("PAID");
    expect(resultado.fatura.excluida).toBe(false);
    expect(memoria.faturas.get("inv_baixa")?.status).toBe("CANCELLED");
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: aberta.id } });
    expect(baixa.efeitoBanco).toBe("CORA_CANCELADO");
    expect(baixa.avisoBanco).toMatch(/marcada como paga/);

    process.env.CORA_WEBHOOK_SEGREDO = "segredo-webhook-cora-stage-01";
    limparLimiteWebhookCora();
    await processarWebhookCora(
      "segredo-webhook-cora-stage-01",
      new Headers({
        "user-agent": "Cora-Webhook",
        "webhook-event-id": "evt_cora_cancel_baixa",
        "webhook-event-type": "invoice.canceled",
        "webhook-resource-id": "inv_baixa",
      }),
      { clienteDe: async () => memoria },
    );
    const depois = await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } });
    expect(depois.status).toBe("PAID");
    expect(depois.statusNormalizado).toBe("PAGO");
    expect(depois.excluida).toBe(false);
    delete process.env.CORA_WEBHOOK_SEGREDO;
  });

  it("não marca localmente quando a Cora recusa o cancelamento", async () => {
    const aberta = await fatura({
      provedor: "CORA",
      status: "LATE",
      statusNormalizado: "VENCIDO",
      pagamento: null,
      idExterno: "inv_falha",
    });
    const memoria = new CoraMemoria();
    memoria.faturas.set("inv_falha", {
      id: "inv_falha",
      status: "LATE",
      valor: "350.00",
      valorPago: "0.00",
      vencimento: "2026-11-10",
      pagoEm: null,
      codigo: null,
      linhaDigitavel: null,
      codigoBarras: null,
      boletoUrl: null,
      pixCopiaCola: null,
      descricao: null,
      metodo: null,
    });
    memoria.falharCancelamento = true;
    await expect(darBaixaManual(autor(empresaId), aberta.id, entrada(), { agora: AGORA, cora: memoria })).rejects.toMatchObject({
      status: 504,
    });
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } });
    expect(gravada.status).toBe("LATE");
    expect(gravada.pagoEm).toBeNull();
    expect(await prisma.conciliacaoPagamento.count({ where: { faturaId: aberta.id } })).toBe(0);
  });

  it("marca banco sem API só localmente e avisa que o boleto pode seguir aberto", async () => {
    const aberta = await fatura({
      provedor: "INTER",
      status: "ATRASADO",
      statusNormalizado: "VENCIDO",
      pagamento: null,
      idExterno: "inter_1",
    });
    await expect(
      darBaixaManual(autor(empresaId), aberta.id, entrada({ pagoEm: "2026-11-21" }), { agora: AGORA }),
    ).rejects.toMatchObject({ status: 400, codigo: "data_futura" });
    const resultado = await darBaixaManual(autor(empresaId), aberta.id, entrada({ forma: "TRANSFERENCIA" }), { agora: AGORA });
    expect(resultado.aviso).toMatch(/pode continuar em aberto no banco/);
    expect(resultado.fatura.status).toBe("MARCADO_RECEBIDO");
    expect(statusEh(resultado.fatura.status, "REGUA_ABERTA", "INTER")).toBe(false);
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: aberta.id } });
    expect(baixa.efeitoBanco).toBe("SOMENTE_LOCAL");
    expect(baixa.formaRecebimento).toBe("TRANSFERENCIA");
  });
});
