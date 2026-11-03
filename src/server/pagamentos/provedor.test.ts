import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/pagamento/[provedor]/[segredo]/route";
import { completarCnpj } from "@/lib/documento";
import { normalizarStatusAsaas } from "@/lib/status-cobranca";
import type { StatusCobranca } from "@/lib/status-cobranca";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { prisma } from "@/server/db";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "@/server/services/teste-db";
import { AdaptadorAsaas, CAPACIDADES_ASAAS, normalizarCorpoWebhookAsaas } from "./asaas-adaptador";
import { aplicarEventoDeProvedor } from "./aplicar-evento";
import { cifrarCredenciais, decifrarCredenciais, lerCredenciaisProvedor, salvarCredenciaisProvedor } from "./cofre";
import { confirmarEventoAntesDaBaixa } from "./confirmar-evento";
import type { CobrancaNormalizada, EventoNormalizado, ProvedorPagamento } from "./contrato";
import { recorrenciaPeloTaguaro } from "./contrato";
import { definirProvedorPagamento } from "./fabrica";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
usarBancoDeTeste();

const BRUTOS = [
  "CRIANDO",
  "ERRO_EMISSAO",
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "OVERDUE",
  "DUNNING_REQUESTED",
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "DUNNING_RECEIVED",
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "NAO_MAPEADO",
];

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
});

let empresaId = "";
let clienteId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Provedor", cnpj: completarCnpj("580000000001") })).id;
  clienteId = (
    await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Ana",
        razaoSocial: "Ana Ltda",
        documento: "12345678901",
        tipoDocumento: "CPF",
        segmento: "OUTRO",
        contatoNome: "Ana",
        whatsapp: "11999999999",
        email: "ana@exemplo.test",
        cidade: "Sao Paulo",
        uf: "SP",
        status: "ATIVO",
      },
    })
  ).id;
});

function evento(status: StatusCobranca | null, id = "evt_1"): EventoNormalizado {
  return {
    idEvento: id,
    tipo: "invoice.paid",
    idExterno: "inv_1",
    status,
    statusBruto: status === "PAGA" ? "PAID" : "OPEN",
    pagoEm: status === "PAGA" ? new Date("2026-11-09T00:00:00.000Z") : null,
    valorPago: status === "PAGA" ? "10.00" : null,
    meio: "BOLETO",
    visualizacao: false,
    excluida: false,
    bruto: { id },
  };
}

function cobranca(status: StatusCobranca): CobrancaNormalizada {
  return {
    idExterno: "inv_1",
    idClienteExterno: null,
    idAssinaturaExterna: null,
    status,
    statusBruto: status,
    valor: "10.00",
    vencimento: "2026-11-10",
    pagoEm: status === "PAGA" ? "2026-11-09" : null,
    meio: "BOLETO",
    boletoUrl: null,
    faturaUrl: null,
    descricao: null,
    excluida: false,
    chaveIdempotencia: null,
    bruto: {},
  };
}

function provedorFalso(consulta: StatusCobranca | "falha", confirmar = true): ProvedorPagamento {
  let consultas = 0;
  const provedor: ProvedorPagamento = {
    provedor: "CORA",
    capacidades: () => ({
      ...CAPACIDADES_ASAAS,
      cartao: false,
      assinaturaNativa: false,
      visualizacao: false,
      precisaClienteRemoto: false,
      webhookAssinado: false,
      confirmarBaixaPorConsulta: confirmar,
    }),
    async testarConexao() {
      return { titular: "Cora" };
    },
    async criarCobranca() {
      throw new Error("sem emissao");
    },
    async consultarCobranca() {
      consultas += 1;
      if (consulta === "falha") throw new Error("fora do ar");
      return cobranca(consulta);
    },
    async cancelarCobranca() {},
    async normalizarWebhook() {
      return [evento("PAGA")];
    },
  };
  return Object.assign(provedor, { consultas: () => consultas });
}

describe("provedor de pagamento", () => {
  it("espelha o status do Asaas no banco do mesmo jeito que a função", async () => {
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.provedorPagamento).toBe("ASAAS");

    for (const [indice, status] of BRUTOS.entries()) {
      const gravada = await prisma.fatura.create({
        data: {
          empresaId,
          clienteId,
          valor: "10.00",
          vencimento: new Date("2026-11-10T00:00:00.000Z"),
          status,
          formaCobranca: "BOLETO",
          asaasPaymentId: `pay_${indice}`,
        },
      });
      expect(gravada.status).toBe(status);
      expect(gravada.statusNormalizado).toBe(normalizarStatusAsaas(status));
      expect(gravada.provedor).toBe("ASAAS");
      expect(gravada.idExterno).toBe(`pay_${indice}`);
    }

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: { asaasCustomerId: "cus_espelho" },
    });
    expect(cliente.idExterno).toBe("cus_espelho");
    expect(cliente.provedor).toBe("ASAAS");

    const servico = await prisma.servico.create({
      data: { empresaId, nome: "Mensalidade", precoPadrao: "10.00" },
    });
    const vinculo = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId,
        servicoId: servico.id,
        valor: "10.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-11-01T00:00:00.000Z"),
        asaasSubscriptionId: "sub_espelho",
      },
    });
    expect(vinculo.idAssinaturaExterna).toBe("sub_espelho");
  });

  it("só deixa escolher o Asaas e guarda credencial de banco futuro cifrada", async () => {
    await expect(definirProvedorPagamento(empresaId, "CORA")).rejects.toMatchObject({ codigo: "provedor_indisponivel" });
    await expect(definirProvedorPagamento(empresaId, "ASAAS")).resolves.toBe("ASAAS");

    const segredo = "client-secret-cora-nao-pode-aparecer";
    const certificado = "-----BEGIN CERTIFICATE-----\nCORA\n-----END CERTIFICATE-----";
    const chave = "-----BEGIN PRIVATE KEY-----\nCORA\n-----END PRIVATE KEY-----";
    const pacote = cifrarCredenciais({
      clientId: "cliente-cora",
      clientSecret: segredo,
      certificadoPem: certificado,
      chavePrivadaPem: chave,
      extras: { conta: "123" },
    });
    expect(pacote.credenciaisCifradas).not.toContain(segredo);
    expect(pacote.certificadoCifrado).not.toContain("BEGIN CERTIFICATE");
    expect(pacote.chavePrivadaCifrada).not.toContain("PRIVATE KEY");
    expect(decifrarCredenciais(pacote)).toMatchObject({
      clientId: "cliente-cora",
      clientSecret: segredo,
      certificadoPem: certificado,
      chavePrivadaPem: chave,
      extras: { conta: "123" },
    });

    await expect(
      salvarCredenciaisProvedor({
        empresaId,
        provedor: "ASAAS",
        ambiente: "SANDBOX",
        credenciais: { apiKey: "nao-copiar" },
      }),
    ).rejects.toMatchObject({ codigo: "cofre_asaas" });

    await salvarCredenciaisProvedor({
      empresaId,
      provedor: "CORA",
      ambiente: "SANDBOX",
      credenciais: { clientId: "cliente-cora", clientSecret: segredo, certificadoPem: certificado, chavePrivadaPem: chave },
      segredoWebhook: "segredo-url-cora",
    });
    const linha = await prisma.configuracaoPagamento.findUniqueOrThrow({
      where: { empresaId_provedor: { empresaId, provedor: "CORA" } },
    });
    expect(linha.credenciaisCifradas).not.toContain(segredo);
    expect(linha.certificadoCifrado).not.toContain(certificado);
    expect(linha.chavePrivadaCifrada).not.toContain(chave);
    await expect(lerCredenciaisProvedor(empresaId, "CORA")).resolves.toMatchObject({
      clientId: "cliente-cora",
      clientSecret: segredo,
      certificadoPem: certificado,
    });
  });

  it("normaliza o webhook do Asaas e não consulta de novo antes da baixa", async () => {
    const [recebido] = normalizarCorpoWebhookAsaas({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", status: "RECEIVED", value: 10, billingType: "PIX", clientPaymentDate: "2026-11-01" },
    });
    expect(recebido).toMatchObject({
      idEvento: "evt_1",
      tipo: "PAYMENT_RECEIVED",
      idExterno: "pay_1",
      status: "PAGA",
      statusBruto: "RECEIVED",
      valorPago: "10.00",
      meio: "PIX",
      visualizacao: false,
    });
    expect(recebido?.pagoEm?.toISOString()).toBe("2026-11-01T00:00:00.000Z");

    const [vencido] = normalizarCorpoWebhookAsaas({
      id: "evt_2",
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_2", status: "OVERDUE", billingType: "BOLETO" },
    });
    expect(vencido?.status).toBe("VENCIDA");

    const [visto] = normalizarCorpoWebhookAsaas({
      id: "evt_3",
      event: "PAYMENT_CHECKOUT_VIEWED",
      payment: { id: "pay_3", status: "PENDING" },
    });
    expect(visto).toMatchObject({ visualizacao: true, status: null });

    const [apagado] = normalizarCorpoWebhookAsaas({
      id: "evt_4",
      event: "PAYMENT_DELETED",
      payment: { id: "pay_4", status: "PENDING", deleted: true },
    });
    expect(apagado).toMatchObject({ status: "CANCELADA", excluida: true });

    const [estornado] = normalizarCorpoWebhookAsaas({
      id: "evt_5",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_5", status: "REFUNDED", billingType: "CREDIT_CARD" },
    });
    expect(estornado).toMatchObject({ status: "ESTORNADA", meio: "CARTAO" });
    expect(normalizarCorpoWebhookAsaas({ id: "", event: "PAYMENT_RECEIVED" })).toEqual([]);

    const provedor = new AdaptadorAsaas(new AsaasMemoria("consulta"));
    expect(provedor.capacidades().confirmarBaixaPorConsulta).toBe(false);
    expect(provedor.capacidades().assinaturaNativa).toBe(true);
    expect(recorrenciaPeloTaguaro(provedor.capacidades())).toBe(false);
    expect(recorrenciaPeloTaguaro({ ...CAPACIDADES_ASAAS, assinaturaNativa: false })).toBe(true);
    const confirmado = await confirmarEventoAntesDaBaixa(provedor, evento("PAGA"));
    expect(confirmado.recusado).toBe(false);
  });

  it("recusa baixa de provedor sem assinatura quando a consulta não confirma o pagamento", async () => {
    await prisma.fatura.create({
      data: {
        empresaId,
        clienteId,
        provedor: "CORA",
        idExterno: "inv_1",
        valor: "10.00",
        vencimento: new Date("2026-11-10T00:00:00.000Z"),
        status: "OPEN",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });

    const negado = provedorFalso("PENDENTE");
    const recusado = await confirmarEventoAntesDaBaixa(negado, evento("PAGA"));
    expect(recusado).toEqual({ recusado: true, motivo: "consulta_nao_confirma" });
    expect(await aplicarEventoDeProvedor(empresaId, negado, evento("PAGA"))).toEqual({
      aplicado: false,
      motivo: "recusado",
    });
    const intacta = await prisma.fatura.findFirstOrThrow({ where: { empresaId, idExterno: "inv_1" } });
    expect(intacta.statusNormalizado).toBe("PENDENTE");
    expect(await prisma.eventoPagamento.count({ where: { empresaId } })).toBe(0);

    const aceito = provedorFalso("PAGA");
    expect(await aplicarEventoDeProvedor(empresaId, aceito, evento("PAGA", "evt_pago"))).toEqual({
      aplicado: true,
      duplicado: false,
    });
    const paga = await prisma.fatura.findFirstOrThrow({ where: { empresaId, idExterno: "inv_1" } });
    expect(paga.statusNormalizado).toBe("PAGA");
    expect(paga.pagoEm?.toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(await prisma.eventoPagamento.count({ where: { empresaId, provedor: "CORA" } })).toBe(1);

    const fora = provedorFalso("falha");
    expect(await confirmarEventoAntesDaBaixa(fora, evento("PAGA", "evt_fora"))).toEqual({
      recusado: true,
      motivo: "consulta_falhou",
    });
  });

  it("a rota genérica não dá baixa e o Asaas continua na rota antiga", async () => {
    const asaas = await POST(
      new Request("http://localhost/api/webhooks/pagamento/asaas/segredo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ provedor: "asaas", segredo: "segredo" }) },
    );
    expect(asaas.status).toBe(404);

    const desconhecido = await POST(
      new Request("http://localhost/api/webhooks/pagamento/nubank/segredo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ provedor: "nubank", segredo: "segredo" }) },
    );
    expect(desconhecido.status).toBe(404);

    const semConfig = await POST(
      new Request("http://localhost/api/webhooks/pagamento/cora/segredo-url-cora", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ provedor: "cora", segredo: "segredo-url-cora" }) },
    );
    expect(semConfig.status).toBe(401);

    await salvarCredenciaisProvedor({
      empresaId,
      provedor: "CORA",
      ambiente: "SANDBOX",
      credenciais: { clientId: "cliente-cora", clientSecret: "secreto" },
      segredoWebhook: "segredo-url-cora",
    });
    const divergente = await POST(
      new Request("http://localhost/api/webhooks/pagamento/cora/segredo-url-cora", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "evt", event: "invoice.paid" }),
      }),
      { params: Promise.resolve({ provedor: "cora", segredo: "segredo-url-cora" }) },
    );
    expect(divergente.status).toBe(409);

    await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: "CORA" } });
    const indisponivel = await POST(
      new Request("http://localhost/api/webhooks/pagamento/cora/segredo-url-cora", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "evt", event: "invoice.paid" }),
      }),
      { params: Promise.resolve({ provedor: "cora", segredo: "segredo-url-cora" }) },
    );
    expect(indisponivel.status).toBe(409);
    const corpo = (await indisponivel.json()) as { codigo?: string };
    expect(corpo.codigo).toBe("provedor_indisponivel");
  });
});
