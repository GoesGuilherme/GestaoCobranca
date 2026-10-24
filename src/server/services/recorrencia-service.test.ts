import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { descreverCobranca } from "@/lib/cobranca";
import { dataHojeIso, proximoVencimentoIso } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { processarWebhookAsaas } from "./asaas-webhook-service";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { importarFaturas } from "./fatura-service";
import {
  ativarRecorrencia,
  ativarRecorrenciaEmLote,
  cancelarRecorrencia,
  editarRecorrencia,
  listarPreviaRecorrencia,
  pausarRecorrencia,
  retomarRecorrencia,
} from "./recorrencia-service";
import { obterPreferenciasCobranca, salvarPreferenciasCobranca } from "./preferencia-cobranca-service";
import { criarServico } from "./servico-service";
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
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Recorrência", cnpj: completarCnpj("580000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Recorrência", cnpj: completarCnpj("580000000002") })
  ).id;
});

function autor(papel: PapelUsuario, id = empresaId) {
  return { empresaId: id, papel };
}

function hoje() {
  return dataHojeIso();
}

async function vendaMensal(nome: string, valor: string, documento: string, extra: Record<string, string> = {}) {
  const servico = await criarServico(autor("DONO"), {
    nome,
    precoPadrao: valor,
    ativo: true,
  });
  const cliente = await criarCliente(empresaId, {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  });
  const vinculo = await criarServicoDoCliente(autor("DONO"), cliente.id, {
    servicoId: servico.id,
    valor,
    recorrencia: extra.recorrencia ?? "MENSAL",
    inicioEm: "2026-04-01",
    status: extra.status ?? "ATIVO",
  });
  return { servico, cliente, vinculo };
}

describe("recorrência Asaas", () => {
  it("cria, edita, pausa, retoma e cancela a assinatura mensal", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const { cliente, vinculo } = await vendaMensal("Cantina Recorrente", "150,00", completarCnpj("580000000003"));
    const memoria = new AsaasMemoria("rec");
    const vencimento = proximoVencimentoIso(10, hoje());

    await expect(
      ativarRecorrencia(autor("SUPORTE"), vinculo.id, { diaVencimento: 10, valor: "150,00" }, memoria),
    ).rejects.toMatchObject({ status: 403, codigo: "sem_permissao" });
    expect(memoria.assinaturas.size).toBe(0);

    const ativada = await ativarRecorrencia(
      autor("FINANCEIRO"),
      vinculo.id,
      { diaVencimento: 10, formaCobranca: "BOLETO", valor: "150,00", descricao: "Mensalidade Cantina" },
      memoria,
    );
    expect(ativada.recorrenciaAsaas?.status).toBe("ACTIVE");
    expect(ativada.recorrenciaAsaas?.proximoVencimento).toBe(vencimento);
    expect(ativada.valor).toBe("150.00");
    const linha = await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } });
    expect(linha.empresaId).toBe(empresaId);
    expect(linha.asaasSubscriptionId).toMatch(/^sub_rec_/);
    expect(JSON.stringify(ativada)).not.toContain(CHAVE);
    expect(await prisma.fatura.count({ where: { empresaId, clienteServicoId: vinculo.id } })).toBe(1);

    await expect(
      ativarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 10 }, memoria),
    ).rejects.toMatchObject({ status: 409, codigo: "assinatura_existente" });

    const editada = await editarRecorrencia(
      autor("DONO"),
      vinculo.id,
      { diaVencimento: 10, valor: "180,00", atualizarPendentes: true, formaCobranca: "PIX" },
      memoria,
    );
    expect(editada.valor).toBe("180.00");
    expect(editada.recorrenciaAsaas?.formaCobranca).toBe("PIX");
    const aberta = await prisma.fatura.findFirstOrThrow({ where: { clienteServicoId: vinculo.id, excluida: false } });
    expect(aberta.valor.toFixed(2)).toBe("180.00");
    expect(aberta.formaCobranca).toBe("PIX");

    const pausada = await pausarRecorrencia(autor("DONO"), vinculo.id, memoria);
    expect(pausada.recorrenciaAsaas?.status).toBe("INACTIVE");
    const retomada = await retomarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 10 }, memoria);
    expect(retomada.recorrenciaAsaas?.status).toBe("ACTIVE");

    await expect(cancelarRecorrencia(autor("DONO", outraEmpresaId), vinculo.id, memoria)).rejects.toMatchObject({
      status: 404,
    });
    const cancelada = await cancelarRecorrencia(autor("DONO"), vinculo.id, memoria);
    expect(cancelada.recorrenciaAsaas?.status).toBe("CANCELADA");
    expect((await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } })).asaasSubscriptionId).toBe(
      linha.asaasSubscriptionId,
    );
    expect((await prisma.fatura.findFirstOrThrow({ where: { id: aberta.id } })).excluida).toBe(true);
    expect(memoria.assinaturas.get(linha.asaasSubscriptionId!)?.excluida).toBe(true);

    const deNovo = await ativarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 10 }, memoria);
    expect(deNovo.recorrenciaAsaas?.status).toBe("ACTIVE");
    expect(cliente.id).toBe(vinculo.clienteId);
  });

  it("mostra a prévia sem criar e só confirma o que foi escolhido", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const primeira = await vendaMensal("Cliente Um", "100,00", completarCnpj("580000000004"));
    const segunda = await vendaMensal("Cliente Dois", "80,00", completarCnpj("580000000005"));
    const avulsa = await vendaMensal("Cliente Avulso", "40,00", completarCnpj("580000000006"), { recorrencia: "AVULSO" });
    const memoria = new AsaasMemoria("lote");
    await ativarRecorrencia(autor("DONO"), primeira.vinculo.id, { diaVencimento: 5 }, memoria);

    await expect(listarPreviaRecorrencia(autor("SUPORTE"), { diaVencimento: 5 })).rejects.toMatchObject({
      status: 403,
    });
    const previa = await listarPreviaRecorrencia(autor("FINANCEIRO"), { diaVencimento: 5 });
    expect(previa.itens.map((item) => item.id)).toEqual([segunda.vinculo.id]);
    expect(previa.itens[0]).toMatchObject({
      nomeCliente: "Cliente Dois",
      nomeServico: "Cliente Dois",
      valor: "80.00",
    });
    expect(previa.vencimento).toBe(proximoVencimentoIso(5, hoje()));
    expect(memoria.assinaturas.size).toBe(1);
    expect(previa.itens.some((item) => item.id === avulsa.vinculo.id)).toBe(false);

    const lote = await ativarRecorrenciaEmLote(
      autor("DONO"),
      { diaVencimento: 5, formaCobranca: "BOLETO", ids: [segunda.vinculo.id, primeira.vinculo.id, "de-outra-empresa"] },
      memoria,
    );
    expect(lote.criadas).toBe(1);
    expect(lote.falhas.map((item) => item.id).sort()).toEqual([primeira.vinculo.id, "de-outra-empresa"].sort());
    expect(memoria.assinaturas.size).toBe(2);
    expect(await prisma.clienteServico.count({ where: { empresaId: outraEmpresaId, asaasSubscriptionId: { not: null } } })).toBe(0);
  });

  it("espelha o pagamento da assinatura pelo webhook e importa sem duplicar", async () => {
    const config = await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const { cliente, vinculo } = await vendaMensal("Cliente Webhook", "90,00", completarCnpj("580000000007"));
    const memoria = new AsaasMemoria("imp");
    await ativarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 12, formaCobranca: "BOLETO" }, memoria);
    const linha = await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } });
    const token = config.tokenWebhook ?? "";

    const primeiro = await processarWebhookAsaas(token, {
      id: "evt_assinatura_criada_0001",
      event: "PAYMENT_CREATED",
      payment: {
        id: "pay_assinatura_nova",
        customer: "cus_que_nao_existe_aqui",
        subscription: linha.asaasSubscriptionId,
        value: 90,
        dueDate: "2026-12-12",
        status: "PENDING",
        billingType: "BOLETO",
        invoiceUrl: "https://sandbox.asaas.com/i/pay_assinatura_nova",
      },
    });
    expect(primeiro.duplicado).toBe(false);
    const espelhada = await prisma.fatura.findFirstOrThrow({
      where: { empresaId, asaasPaymentId: "pay_assinatura_nova" },
    });
    expect(espelhada.clienteId).toBe(cliente.id);
    expect(espelhada.clienteServicoId).toBe(vinculo.id);

    await processarWebhookAsaas(token, {
      id: "evt_assinatura_criada_0001",
      event: "PAYMENT_CREATED",
      payment: {
        id: "pay_assinatura_nova",
        customer: "cus_que_nao_existe_aqui",
        subscription: linha.asaasSubscriptionId,
        value: 90,
        dueDate: "2026-12-12",
        status: "RECEIVED",
        billingType: "BOLETO",
      },
    });
    expect(await prisma.fatura.count({ where: { asaasPaymentId: "pay_assinatura_nova" } })).toBe(1);

    const outra = await salvarConfiguracaoAsaas(autor("DONO", outraEmpresaId), { ambiente: "SANDBOX", chaveApi: CHAVE });
    await processarWebhookAsaas(outra.tokenWebhook, {
      id: "evt_de_outra_assinatura_0001",
      event: "PAYMENT_CREATED",
      payment: {
        id: "pay_nao_deve_entrar",
        customer: "cus_que_nao_existe_aqui",
        subscription: linha.asaasSubscriptionId,
        value: 1,
        dueDate: "2026-12-12",
        status: "PENDING",
        billingType: "BOLETO",
      },
    });
    expect(await prisma.fatura.count({ where: { empresaId: outraEmpresaId } })).toBe(0);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: espelhada.id } })).status).toBe("PENDING");

    await expect(importarFaturas(autor("SUPORTE"), memoria)).rejects.toMatchObject({ status: 403 });
    const antes = await prisma.fatura.count({ where: { empresaId } });
    const importacao = await importarFaturas(autor("FINANCEIRO"), memoria);
    expect(importacao.criadas).toBe(0);
    expect(importacao.atualizadas).toBeGreaterThan(0);
    expect(await prisma.fatura.count({ where: { empresaId } })).toBe(antes);

    const customer = (await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).asaasCustomerId ?? "";
    await memoria.criarCobranca({
      customer,
      formaCobranca: "BOLETO",
      valor: "45.00",
      vencimento: "2026-12-20",
      descricao: "Avulsa importada",
    });
    const nova = await importarFaturas(autor("DONO"), memoria);
    expect(nova.criadas).toBe(1);
    const repetida = await importarFaturas(autor("DONO"), memoria);
    expect(repetida.criadas).toBe(0);
    expect(repetida.atualizadas).toBe(2);
    expect(await prisma.fatura.count({ where: { empresaId } })).toBe(antes + 1);
  });

  it("aplica as preferências da empresa e não as de outra conta", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const preferencias = {
      formaCobranca: "PIX" as const,
      diaVencimento: 15,
      modeloDescricao: "{servico} de {cliente} em {mes}",
      multaPercentual: "2,00",
      jurosPercentual: "1,00",
      descontoPercentual: "5,00",
      descontoDiasAntes: 3,
      diasAntesGerar: 14 as const,
      atualizarPendentes: true,
    };
    await expect(salvarPreferenciasCobranca(autor("FINANCEIRO"), preferencias)).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    await expect(salvarPreferenciasCobranca(autor("SUPORTE"), preferencias)).rejects.toMatchObject({ status: 403 });
    const salvas = await salvarPreferenciasCobranca(autor("DONO"), preferencias);
    expect(salvas.diasAntesGerar).toBe(14);
    expect(salvas.multaPercentual).toBe("2.00");
    expect(await obterPreferenciasCobranca(outraEmpresaId)).toMatchObject({
      formaCobranca: "BOLETO",
      diaVencimento: 10,
      modeloDescricao: "Mensalidade {servico}",
      multaPercentual: null,
      jurosPercentual: null,
      descontoPercentual: null,
      diasAntesGerar: null,
      atualizarPendentes: false,
    });

    const { cliente, servico, vinculo } = await vendaMensal("Cantina Preferência", "150,00", completarCnpj("580000000008"));
    const memoria = new AsaasMemoria("pref");
    const ativada = await ativarRecorrencia(autor("FINANCEIRO"), vinculo.id, {}, memoria);
    const vencimento = proximoVencimentoIso(15, hoje());
    expect(ativada.recorrenciaAsaas).toMatchObject({
      formaCobranca: "PIX",
      diaVencimento: 15,
      proximoVencimento: vencimento,
      descricao: descreverCobranca(preferencias.modeloDescricao, {
        servico: servico.nome,
        cliente: cliente.nomeFantasia,
        vencimento: vencimento ?? "",
      }),
    });
    const guardada = [...memoria.assinaturas.values()][0];
    expect(guardada?.encargos).toEqual({
      multaPercentual: "2.00",
      jurosPercentual: "1.00",
      descontoPercentual: "5.00",
      descontoDiasAntes: 3,
    });
    expect(JSON.stringify(guardada)).not.toContain("daysBefore");

    await editarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 15, valor: "160,00" }, memoria);
    const aberta = await prisma.fatura.findFirstOrThrow({ where: { clienteServicoId: vinculo.id, excluida: false } });
    expect(aberta.valor.toFixed(2)).toBe("160.00");

    await editarRecorrencia(
      autor("DONO"),
      vinculo.id,
      {
        diaVencimento: 15,
        valor: "170,00",
        atualizarPendentes: false,
        multaPercentual: null,
        jurosPercentual: null,
        descontoPercentual: null,
      },
      memoria,
    );
    expect((await prisma.fatura.findFirstOrThrow({ where: { id: aberta.id } })).valor.toFixed(2)).toBe("160.00");
    expect(guardada?.encargos.multaPercentual).toBe("2.00");

    const lote = await ativarRecorrenciaEmLote(
      autor("DONO"),
      { diaVencimento: 8, ids: [vinculo.id] },
      memoria,
    );
    expect(lote.criadas).toBe(0);
    const segunda = await vendaMensal("Outra Preferência", "80,00", completarCnpj("580000000009"));
    const criada = await ativarRecorrenciaEmLote(
      autor("DONO"),
      { diaVencimento: 8, ids: [segunda.vinculo.id] },
      memoria,
    );
    expect(criada.criadas).toBe(1);
    const nova = [...memoria.assinaturas.values()].at(-1);
    expect(nova?.formaCobranca).toBe("PIX");
    expect(nova?.descricao).toBe(
      descreverCobranca(preferencias.modeloDescricao, {
        servico: "Outra Preferência",
        cliente: "Outra Preferência",
        vencimento: proximoVencimentoIso(8, hoje()) ?? "",
      }),
    );
    expect(nova?.proximoVencimento).toBe(proximoVencimentoIso(8, hoje()));
  });

  it("importa mesmo quando uma assinatura antiga não existe mais no Asaas", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const { vinculo } = await vendaMensal("Cliente Sumido", "70,00", completarCnpj("580000000010"));
    const memoria = new AsaasMemoria("sumiu");
    await ativarRecorrencia(autor("DONO"), vinculo.id, { diaVencimento: 10 }, memoria);
    const http = new Proxy(memoria, {
      get(alvo, propriedade, receptor) {
        if (propriedade === "listarCobrancasDaAssinatura") {
          return async () => {
            const erro = new Error("Assinatura não encontrada.");
            erro.name = "ErroAsaas";
            Object.assign(erro, { status: 404 });
            throw erro;
          };
        }
        const valor = Reflect.get(alvo, propriedade, receptor) as unknown;
        return typeof valor === "function" ? (valor as (...args: unknown[]) => unknown).bind(alvo) : valor;
      },
    });
    const resultado = await importarFaturas(autor("FINANCEIRO"), http);
    expect(resultado.criadas + resultado.atualizadas).toBeGreaterThan(0);
  });
});
