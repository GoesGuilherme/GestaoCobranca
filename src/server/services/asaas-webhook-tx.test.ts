import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { completarCnpj } from "@/lib/documento";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { urlParaPg } from "@/server/url-pg";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { aplicarPagamentoAsaas, processarWebhookAsaas } from "./asaas-webhook-service";
import { criarCliente } from "./cliente-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { enfileirarPagoDoPagamento } from "./whatsapp-pago";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ASAAS_MOCK;
delete process.env.TWILIO_MOCK;

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const MODELOS = [
  "subcontaTwilio",
  "numeroTwilioEmpresa",
  "templateWhatsapp",
  "optOutWhatsapp",
  "configuracaoTwilio",
  "logoEmpresa",
  "filaWhatsapp",
  "configuracaoRegua",
] as const;
const METODOS = ["findUnique", "findFirst", "findMany", "create", "update", "updateMany", "deleteMany"] as const;

let empresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
  delete process.env.TWILIO_MOCK;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
});

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Webhook", cnpj: completarCnpj("594000000001") })).id;
});

afterEach(() => {
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
});

function autor(): AutorEmpresa {
  return {
    usuarioId: "usuario-webhook",
    nome: "Dono",
    email: "dono.webhook@exemplo.test",
    empresaId,
    papel: "DONO",
  };
}

function vigiarPrismaGlobal() {
  let profundidade = 0;
  const cliente = prisma as unknown as {
    $transaction: (fn: unknown, opcoes?: unknown) => Promise<unknown>;
  };
  const originalTx = cliente.$transaction.bind(prisma);
  cliente.$transaction = async (fn: unknown, opcoes?: unknown) => {
    if (typeof fn !== "function") return originalTx(fn, opcoes);
    return originalTx(async (tx: unknown) => {
      profundidade += 1;
      try {
        return await (fn as (tx: unknown) => Promise<unknown>)(tx);
      } finally {
        profundidade -= 1;
      }
    }, opcoes);
  };
  const restaurar: Array<() => void> = [() => {
    cliente.$transaction = originalTx;
  }];
  const raiz = prisma as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  for (const nome of MODELOS) {
    const modelo = raiz[nome];
    if (!modelo) continue;
    for (const metodo of METODOS) {
      const atual = modelo[metodo];
      if (typeof atual !== "function") continue;
      const original = atual.bind(modelo);
      modelo[metodo] = (...args: unknown[]) => {
        if (profundidade > 0) {
          throw new Error(`prisma global ${nome}.${metodo} dentro da transação`);
        }
        return original(...args);
      };
      restaurar.push(() => {
        modelo[metodo] = atual;
      });
    }
  }
  return () => {
    for (const passo of restaurar.reverse()) passo();
  };
}

async function faturaPendente(asaasPaymentId: string) {
  const cliente = await criarCliente(empresaId, {
    nomeFantasia: "Cliente Pago",
    razaoSocial: "Cliente Pago Ltda",
    documento: completarCnpj("594000000002"),
    segmento: "RESTAURANTE",
    contatoNome: "Ana",
    whatsapp: "13988881001",
    email: "pago@exemplo.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
  });
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId: cliente.id,
      asaasPaymentId,
      valor: "150.00",
      vencimento: new Date("2026-11-12T00:00:00.000Z"),
      status: "PENDING",
      formaCobranca: "BOLETO",
      boletoUrl: "https://www.asaas.com/i/pago-teste",
      descricao: "Serviço",
    },
  });
}

function evento(id: string, paymentId: string, clientPaymentDate: string) {
  return {
    id,
    event: "PAYMENT_RECEIVED",
    payment: {
      id: paymentId,
      customer: "cus_webhook_tx",
      value: 150,
      dueDate: "2026-11-12",
      status: "RECEIVED",
      billingType: "BOLETO",
      invoiceUrl: "https://www.asaas.com/i/pago-teste",
      clientPaymentDate,
      deleted: false,
    },
  };
}

describe("webhook do Asaas fora do deadlock da transação", () => {
  it("pool de uma conexão não atende consulta no cliente global durante a transação", async () => {
    const cliente = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlParaPg(process.env.DATABASE_URL ?? ""), max: 1 }),
    });
    const inicio = Date.now();
    try {
      await expect(
        cliente.$transaction(async () => {
          await cliente.$queryRaw`SELECT 1`;
        }, { timeout: 1500 }),
      ).rejects.toMatchObject({ code: "P2028" });
    } finally {
      await cliente.$disconnect();
    }
    expect(Date.now() - inicio).toBeLessThan(4000);
  });

  it("confirma o pagamento recente sem consultar o prisma global dentro da transação", async () => {
    const config = await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const paymentId = `pay_${randomBytes(4).toString("hex")}`;
    const fatura = await faturaPendente(paymentId);
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const soltar = vigiarPrismaGlobal();
    const inicio = Date.now();
    try {
      const resposta = await processarWebhookAsaas(config.tokenWebhook, evento("evt_pago_recente_tx", paymentId, hoje));
      expect(resposta.duplicado).toBe(false);
    } finally {
      soltar();
    }
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("RECEIVED");
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: fatura.id, tipo: "PAGO" } })).toBe(1);

    const deNovo = await processarWebhookAsaas(config.tokenWebhook, evento("evt_pago_recente_tx", paymentId, hoje));
    expect(deNovo.duplicado).toBe(true);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: fatura.id, tipo: "PAGO" } })).toBe(1);
  });

  it("não enfileira WhatsApp de pago com data anterior a 24h e a conciliação não segura a transação", async () => {
    const config = await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const paymentId = `pay_${randomBytes(4).toString("hex")}`;
    const fatura = await faturaPendente(paymentId);
    const soltar = vigiarPrismaGlobal();
    const inicio = Date.now();
    try {
      await processarWebhookAsaas(config.tokenWebhook, evento("evt_pago_antigo_tx", paymentId, "2020-01-01"));
      const pagamento = {
        id: paymentId,
        status: "RECEIVED",
        value: 150,
        billingType: "BOLETO",
        clientPaymentDate: "2020-01-01",
      };
      await prisma.$transaction((tx) => aplicarPagamentoAsaas(tx, empresaId, pagamento, "PAYMENT_RECEIVED"));
      await enfileirarPagoDoPagamento(empresaId, pagamento, "PAYMENT_RECEIVED");
    } finally {
      soltar();
    }
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("RECEIVED");
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: fatura.id, tipo: "PAGO" } })).toBe(0);
    expect(config.tokenWebhook).toBeTruthy();
  });
});
