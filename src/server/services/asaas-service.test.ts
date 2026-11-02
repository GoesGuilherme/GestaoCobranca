import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/asaas/route";
import { isoDeData } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { criarCliente } from "./cliente-service";
import {
  obterConfiguracaoAsaas,
  salvarConfiguracaoAsaas,
  testarConexaoAsaas,
} from "./asaas-config-service";
import { cancelarFatura, emitirFatura, listarFaturas } from "./fatura-service";
import { processarWebhookAsaas } from "./asaas-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
});

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Asaas", cnpj: completarCnpj("570000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Asaas", cnpj: completarCnpj("570000000002") })
  ).id;
});

function autor(papel: PapelUsuario, id = empresaId) {
  return { empresaId: id, papel };
}

function cliente(documento: string) {
  return {
    nomeFantasia: "Costa Verde Exemplo",
    razaoSocial: "Costa Verde Exemplo Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  };
}

function cobranca(extra: Record<string, string> = {}) {
  return {
    valor: "189,90",
    vencimento: "2026-11-15",
    formaCobranca: "BOLETO",
    descricao: "Mensalidade avulsa de teste",
    ...extra,
  };
}

describe("Asaas por empresa", () => {
  it("cifra a chave, mostra só a máscara e recusa financeiro e suporte na configuração", async () => {
    await expect(salvarConfiguracaoAsaas(autor("FINANCEIRO"), { ambiente: "SANDBOX", chaveApi: CHAVE })).rejects.toMatchObject({
      status: 403,
    });
    await expect(salvarConfiguracaoAsaas(autor("SUPORTE"), { ambiente: "SANDBOX", chaveApi: CHAVE })).rejects.toMatchObject({
      status: 403,
    });

    const salva = await salvarConfiguracaoAsaas(autor("DONO"), {
      ambiente: "SANDBOX",
      chaveApi: CHAVE,
      empresaId: "empresa-do-navegador",
    });
    expect(salva.chaveMascarada).toBe("••••0001");
    expect(salva.tokenWebhook).toBeTruthy();
    expect(JSON.stringify(salva)).not.toContain(CHAVE);

    const linha = await prisma.configuracaoAsaas.findUniqueOrThrow({ where: { empresaId } });
    expect(linha.empresaId).toBe(empresaId);
    expect(linha.chaveApiCifrada).not.toContain(CHAVE);
    expect(linha.tokenWebhookCifrado).not.toContain(salva.tokenWebhook);
    expect(linha.chaveApiUltimos4).toBe("0001");

    const deNovo = await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "PRODUCAO" });
    expect(deNovo.ambiente).toBe("PRODUCAO");
    expect(deNovo.chaveMascarada).toBe("••••0001");
    expect(deNovo.tokenWebhook).toBe(salva.tokenWebhook);

    const memoria = new AsaasMemoria("cfg");
    await expect(testarConexaoAsaas(autor("DONO"), memoria)).resolves.toMatchObject({ conectado: true });
    memoria.falharConexao = true;
    await expect(testarConexaoAsaas(autor("DONO"), memoria)).rejects.toMatchObject({ status: 400 });
    await expect(obterConfiguracaoAsaas(autor("SUPORTE"))).rejects.toMatchObject({ status: 403 });
  });

  it("cria o cliente no Asaas uma vez, emite, cancela e isola a outra empresa", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("570000000003")));
    const memoria = new AsaasMemoria("fat");
    memoria.clientes.push({
      id: "cus_ja_existente",
      nome: "Costa Verde Exemplo Ltda",
      cpfCnpj: cadastro.documento.replace(/\D/g, ""),
      email: "",
      telefone: "",
      referencia: "",
    });

    await expect(emitirFatura(autor("SUPORTE"), cadastro.id, cobranca(), memoria)).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    await expect(listarFaturas(autor("SUPORTE"), { situacao: "todas" })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    expect(memoria.cobrancas.size).toBe(0);

    const fatura = await emitirFatura(autor("FINANCEIRO"), cadastro.id, {
      ...cobranca(),
      empresaId: "outra",
    }, memoria);
    expect(fatura.valor).toBe("189.90");
    expect(fatura.status).toBe("PENDING");
    expect(fatura.boletoUrl).toContain("sandbox.asaas.com");
    expect(fatura.linhaDigitavel).toBeTruthy();
    expect(memoria.clientes).toHaveLength(1);
    const vinculado = await prisma.cliente.findUniqueOrThrow({ where: { id: cadastro.id } });
    expect(vinculado.asaasCustomerId).toBe("cus_ja_existente");
    expect(vinculado.empresaId).toBe(empresaId);

    const segunda = await emitirFatura(autor("DONO"), cadastro.id, cobranca({ formaCobranca: "PIX", valor: "50,00" }), memoria);
    expect(segunda.pixCopiaCola).toContain("br.gov.bcb.pix");
    expect(segunda.boletoUrl).toBeNull();
    expect(memoria.clientes).toHaveLength(1);

    const abertas = await listarFaturas(autor("FINANCEIRO"), { situacao: "em_aberto" });
    expect(abertas.map((item) => item.id).sort()).toEqual([fatura.id, segunda.id].sort());
    expect(await listarFaturas(autor("DONO", outraEmpresaId), { situacao: "todas" })).toEqual([]);

    await expect(cancelarFatura(autor("SUPORTE"), fatura.id, memoria)).rejects.toMatchObject({ status: 403 });
    await expect(cancelarFatura(autor("DONO", outraEmpresaId), fatura.id, memoria)).rejects.toMatchObject({
      status: 404,
    });
    const cancelada = await cancelarFatura(autor("DONO"), fatura.id, memoria);
    expect(cancelada.excluida).toBe(true);
    expect(memoria.cobrancas.get(fatura.asaasPaymentId)?.excluida).toBe(true);
    expect((await listarFaturas(autor("DONO"), { situacao: "em_aberto" })).map((item) => item.id)).toEqual([segunda.id]);
    expect((await listarFaturas(autor("DONO"), { situacao: "canceladas" })).map((item) => item.id)).toEqual([fatura.id]);

    await expect(emitirFatura(autor("DONO"), cadastro.id, cobranca({ valor: "0" }), memoria)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("recria o cliente no Asaas quando o id guardado sumiu", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("570000000009")));
    await prisma.cliente.update({
      where: { id: cadastro.id },
      data: { asaasCustomerId: "cus_sumiu" },
    });
    const memoria = new AsaasMemoria("sumiu");
    const fatura = await emitirFatura(autor("DONO"), cadastro.id, cobranca(), memoria);
    const atual = await prisma.cliente.findUniqueOrThrow({ where: { id: cadastro.id } });
    expect(atual.asaasCustomerId).not.toBe("cus_sumiu");
    expect(memoria.clientes.some((item) => item.id === atual.asaasCustomerId)).toBe(true);
    expect(fatura.status).toBe("PENDING");
  });

  it("atualiza a fatura pelo webhook uma vez e ignora a repetição", async () => {
    const config = await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("570000000004")));
    const memoria = new AsaasMemoria("wh");
    const fatura = await emitirFatura(autor("DONO"), cadastro.id, cobranca(), memoria);
    const token = config.tokenWebhook ?? "";
    const evento = {
      id: "evt_pagamento_recebido_teste_0001",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: fatura.asaasPaymentId,
        customer: "cus_wh_1",
        value: 189.9,
        dueDate: "2026-11-15",
        status: "RECEIVED",
        billingType: "BOLETO",
        invoiceUrl: "https://sandbox.asaas.com/i/recebido",
        clientPaymentDate: "2026-11-14",
        paymentDate: "2026-11-16",
        deleted: false,
      },
    };

    const primeiro = await processarWebhookAsaas(token, evento);
    expect(primeiro.duplicado).toBe(false);
    const segundo = await processarWebhookAsaas(token, evento);
    expect(segundo.duplicado).toBe(true);
    expect(await prisma.eventoAsaas.count({ where: { empresaId } })).toBe(1);

    const recebida = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(recebida.status).toBe("RECEIVED");
    expect(recebida.pagoEm ? isoDeData(recebida.pagoEm) : null).toBe("2026-11-14");
    expect(recebida.valor.toFixed(2)).toBe("189.90");
    expect(recebida.faturaUrl).toBe("https://sandbox.asaas.com/i/recebido");
    expect(recebida.linhaDigitavel).toBeTruthy();

    const pedido = new Request("http://localhost/api/webhooks/asaas", {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": token },
      body: JSON.stringify(evento),
    });
    const http = await POST(pedido);
    expect(http.status).toBe(200);
    expect(await prisma.eventoAsaas.count({ where: { empresaId } })).toBe(1);

    const semToken = await POST(
      new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(evento),
      }),
    );
    expect(semToken.status).toBe(401);

    const outra = await salvarConfiguracaoAsaas(autor("DONO", outraEmpresaId), {
      ambiente: "SANDBOX",
      chaveApi: CHAVE,
    });
    await processarWebhookAsaas(outra.tokenWebhook, {
      id: "evt_de_outra_empresa_0001",
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: fatura.asaasPaymentId,
        customer: "cus_wh_1",
        value: 1,
        dueDate: "2026-11-15",
        status: "CONFIRMED",
        billingType: "BOLETO",
      },
    });
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("RECEIVED");
    expect(await prisma.fatura.count({ where: { empresaId: outraEmpresaId } })).toBe(0);

    const vinculado = await prisma.cliente.findUniqueOrThrow({ where: { id: cadastro.id } });
    await processarWebhookAsaas(token, {
      id: "evt_criada_fora_0001",
      event: "PAYMENT_CREATED",
      payment: {
        id: "pay_criada_no_asaas",
        customer: vinculado.asaasCustomerId,
        value: 80,
        dueDate: "2026-12-01",
        status: "PENDING",
        billingType: "PIX",
        invoiceUrl: "https://sandbox.asaas.com/i/pay_criada_no_asaas",
      },
    });
    const espelhada = await prisma.fatura.findFirstOrThrow({
      where: { empresaId, asaasPaymentId: "pay_criada_no_asaas" },
    });
    expect(espelhada.valor.toFixed(2)).toBe("80.00");
    expect(espelhada.clienteId).toBe(cadastro.id);

    await processarWebhookAsaas(token, {
      id: "evt_apagada_0001",
      event: "PAYMENT_DELETED",
      payment: { id: fatura.asaasPaymentId, deleted: true, status: "RECEIVED" },
    });
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).excluida).toBe(true);
    await processarWebhookAsaas(token, {
      id: "evt_apagada_0001",
      event: "PAYMENT_DELETED",
      payment: { id: fatura.asaasPaymentId, deleted: true },
    });
    expect(await prisma.eventoAsaas.count({ where: { empresaId, asaasEventId: "evt_apagada_0001" } })).toBe(1);

    await processarWebhookAsaas(token, {
      id: "evt_estorno_pago_em_0001",
      event: "PAYMENT_REFUNDED",
      payment: { id: fatura.asaasPaymentId, status: "REFUNDED", value: 189.9, dueDate: "2026-11-15" },
    });
    const estornada = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(estornada.status).toBe("REFUNDED");
    expect(estornada.pagoEm).toBeNull();
  });
});

describe("emissão sem boleto duplicado", () => {
  async function preparar(documento: string) {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj(documento)));
    const memoria = new AsaasMemoria("dup");
    return { cadastro, memoria };
  }

  async function esperarCriando(clienteId: string) {
    for (let tentativa = 0; tentativa < 50; tentativa += 1) {
      const total = await prisma.fatura.count({ where: { clienteId, status: "CRIANDO" } });
      if (total === 1) return;
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
    throw new Error("A emissão não reservou a fatura.");
  }

  it("reaproveita a mesma cobrança no duplo clique", async () => {
    const { cadastro, memoria } = await preparar("570000000011");
    const chave = "duplo-clique-fatura-0001";
    const resultados = await Promise.allSettled([
      emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria),
      emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria),
    ]);
    const ok = resultados.filter((item) => item.status === "fulfilled");
    expect(ok.length).toBeGreaterThan(0);
    expect(memoria.cobrancas.size).toBe(1);
    const referencia = [...memoria.cobrancas.values()][0]?.referencia;
    expect(ok.every((item) => item.status === "fulfilled" && item.value.id === referencia)).toBe(true);
    const rejeitadas = resultados.filter((item) => item.status === "rejected");
    expect(rejeitadas.every((item) => item.status === "rejected" && item.reason?.codigo === "emissao_em_andamento")).toBe(true);
  });

  it("não cria outra cobrança quando duas requisições correm juntas", async () => {
    const { cadastro, memoria } = await preparar("570000000012");
    let liberar = () => {};
    memoria.segurarCriacao = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const primeira = emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: "concorrencia-fatura-0001" }), memoria);
    try {
      await esperarCriando(cadastro.id);
      await expect(
        emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: "concorrencia-fatura-0002" }), memoria),
      ).rejects.toMatchObject({ status: 409, codigo: "emissao_em_andamento" });
      expect(memoria.cobrancas.size).toBe(0);
    } finally {
      liberar();
    }
    const fatura = await primeira;
    expect(memoria.cobrancas.size).toBe(1);
    expect([...memoria.cobrancas.values()][0]?.referencia).toBe(fatura.id);
    const linha = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(linha.empresaId).toBe(empresaId);
  });

  it("reaproveita a cobrança se o Asaas respondeu com timeout depois de criar", async () => {
    const { cadastro, memoria } = await preparar("570000000013");
    memoria.lancarDepoisDeCriarCobranca = true;
    const chave = "timeout-fatura-0001";
    const fatura = await emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria);
    expect(memoria.cobrancas.size).toBe(1);
    expect([...memoria.cobrancas.values()][0]?.referencia).toBe(fatura.id);
    memoria.lancarDepoisDeCriarCobranca = false;
    const deNovo = await emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria);
    expect(deNovo.id).toBe(fatura.id);
    expect(memoria.cobrancas.size).toBe(1);
  });

  it("cancela de verdade quando não consegue gravar e registra o erro", async () => {
    const { cadastro, memoria } = await preparar("570000000014");
    const original = prisma.fatura.update.bind(prisma.fatura);
    const espiao = vi.spyOn(prisma.fatura, "update").mockImplementation((async (args: { data?: { asaasPaymentId?: string | null; status?: string } }) => {
      const data = args.data;
      if (data?.asaasPaymentId && data.status !== "ERRO_EMISSAO") throw new Error("falha ao gravar");
      return original(args as never);
    }) as never);
    try {
      await expect(
        emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: "falha-gravacao-0001" }), memoria),
      ).rejects.toMatchObject({ status: 502, codigo: "emissao_cancelada" });
    } finally {
      espiao.mockRestore();
    }
    expect(memoria.cobrancas.size).toBe(1);
    expect([...memoria.cobrancas.values()][0]?.excluida).toBe(true);
    const linha = await prisma.fatura.findFirstOrThrow({ where: { clienteId: cadastro.id } });
    expect(linha.erroEmissao).toMatch(/cancelamento foi pedido/);
    expect(linha.empresaId).toBe(empresaId);
  });

  it("guarda a cobrança quando o cancelamento também falha e o retry não cria outra", async () => {
    const { cadastro, memoria } = await preparar("570000000015");
    memoria.cancelarCobrancaLanca = true;
    const original = prisma.fatura.update.bind(prisma.fatura);
    let falhas = 0;
    const espiao = vi.spyOn(prisma.fatura, "update").mockImplementation((async (args: { data?: { asaasPaymentId?: string | null } }) => {
      const data = args.data;
      if (data?.asaasPaymentId) {
        falhas += 1;
        if (falhas <= 2) throw new Error("falha ao gravar");
      }
      return original(args as never);
    }) as never);
    const chave = "falha-cancelamento-0001";
    try {
      await expect(emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria)).rejects.toMatchObject({
        status: 502,
        codigo: "emissao_registrada",
      });
    } finally {
      espiao.mockRestore();
    }
    expect(memoria.cobrancas.size).toBe(1);
    expect([...memoria.cobrancas.values()][0]?.excluida).toBe(false);
    const deNovo = await emitirFatura(autor("DONO"), cadastro.id, cobranca({ chaveIdempotencia: chave }), memoria);
    expect(memoria.cobrancas.size).toBe(1);
    expect(deNovo.asaasPaymentId).toBe([...memoria.cobrancas.values()][0]?.id);
  });
});

describe("visualização da fatura e do boleto", () => {
  it("não mexe no índice parcial de fatura em criação", async () => {
    const sql = readFileSync("prisma/migrations/20261031120000_fatura_visualizada/migration.sql", "utf8");
    expect(sql.toLowerCase()).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/faturas_criando_por_cliente/);
    expect(sql).toContain('ADD COLUMN "visualizada"');
    const linhas = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'faturas_criando_por_cliente'
    `;
    expect(linhas[0]?.indexdef).toContain("(empresa_id, cliente_id)");
    expect(linhas[0]?.indexdef).toContain("CRIANDO");
  });

  it("marca a primeira visualização, ignora repetição e não vaza para outra empresa", async () => {
    const config = await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const outra = await salvarConfiguracaoAsaas(autor("DONO", outraEmpresaId), {
      ambiente: "SANDBOX",
      chaveApi: CHAVE,
    });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("570000000021")));
    const memoria = new AsaasMemoria("view");
    const fatura = await emitirFatura(autor("DONO"), cadastro.id, cobranca(), memoria);
    const segunda = await emitirFatura(
      autor("DONO"),
      cadastro.id,
      cobranca({ formaCobranca: "PIX", valor: "40,00" }),
      memoria,
    );
    expect(fatura.visualizada).toBe(false);
    expect(segunda.visualizada).toBe(false);

    const outroCliente = await criarCliente(outraEmpresaId, cliente(completarCnpj("570000000022")));
    await prisma.cliente.update({
      where: { id: outroCliente.id },
      data: { asaasCustomerId: "cus_outra_visualizacao" },
    });
    await processarWebhookAsaas(outra.tokenWebhook, {
      id: "evt_view_outra_empresa_0001",
      event: "PAYMENT_CHECKOUT_VIEWED",
      dateCreated: "2026-10-31 08:00:00",
      payment: {
        id: fatura.asaasPaymentId,
        customer: "cus_outra_visualizacao",
        value: 10,
        dueDate: "2026-11-15",
        status: "RECEIVED",
        billingType: "BOLETO",
      },
    });
    const intocada = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(intocada.visualizada).toBe(false);
    expect(intocada.status).toBe("PENDING");
    expect(await prisma.fatura.count({ where: { empresaId: outraEmpresaId } })).toBe(0);

    const token = config.tokenWebhook ?? "";
    const evento = {
      id: "evt_checkout_view_0001",
      event: "PAYMENT_CHECKOUT_VIEWED",
      dateCreated: "2026-10-31 09:15:00",
      payment: {
        id: fatura.asaasPaymentId,
        status: "RECEIVED",
        value: 1,
        billingType: "BOLETO",
      },
    };
    const primeiro = await processarWebhookAsaas(token, evento);
    expect(primeiro.duplicado).toBe(false);
    const segundo = await processarWebhookAsaas(token, evento);
    expect(segundo.duplicado).toBe(true);

    const vista = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(vista.visualizada).toBe(true);
    expect(vista.visualizadaEm?.toISOString()).toBe("2026-10-31T12:15:00.000Z");
    expect(vista.status).toBe("PENDING");
    expect(vista.valor.toFixed(2)).toBe("189.90");
    expect(await prisma.eventoAsaas.count({ where: { empresaId, asaasEventId: "evt_checkout_view_0001" } })).toBe(1);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId } })).toBe(0);

    await processarWebhookAsaas(token, {
      id: "evt_boleto_view_0001",
      event: "PAYMENT_BANK_SLIP_VIEWED",
      dateCreated: "2026-10-31 11:40:00",
      payment: { id: fatura.asaasPaymentId, status: "RECEIVED" },
    });
    const deNovo = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(deNovo.visualizadaEm?.toISOString()).toBe("2026-10-31T12:15:00.000Z");
    expect(deNovo.status).toBe("PENDING");
    expect(await prisma.eventoAsaas.count({ where: { empresaId, tipo: "PAYMENT_BANK_SLIP_VIEWED" } })).toBe(1);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId } })).toBe(0);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: segunda.id } })).visualizada).toBe(false);

    const abertas = await listarFaturas(autor("FINANCEIRO"), { situacao: "em_aberto" });
    expect(abertas.find((item) => item.id === fatura.id)?.visualizada).toBe(true);
    expect(abertas.find((item) => item.id === segunda.id)?.visualizada).toBe(false);
    expect((await listarFaturas(autor("DONO"), { situacao: "em_aberto", vista: "vistas" })).map((item) => item.id)).toEqual([
      fatura.id,
    ]);
    expect((await listarFaturas(autor("DONO"), { situacao: "em_aberto", vista: "nao_vistas" })).map((item) => item.id)).toEqual([
      segunda.id,
    ]);
    expect(await listarFaturas(autor("DONO", outraEmpresaId), { situacao: "todas", vista: "vistas" })).toEqual([]);

    const http = await POST(
      new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: { "content-type": "application/json", "asaas-access-token": token },
        body: JSON.stringify(evento),
      }),
    );
    expect(http.status).toBe(200);
    expect(await prisma.eventoAsaas.count({ where: { empresaId, asaasEventId: "evt_checkout_view_0001" } })).toBe(1);

    await expect(processarWebhookAsaas(null, evento)).rejects.toMatchObject({ status: 401 });
  });
});
