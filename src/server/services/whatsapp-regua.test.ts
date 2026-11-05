import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { completarCnpj } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import { prisma } from "@/server/db";
import { criarClienteTwilioMemoria, type ClienteTwilioMemoria } from "@/server/twilio/memoria";
import type { CredencialTwilio } from "@/server/twilio/contrato";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { executarRegua } from "./regua-job";
import { salvarConfiguracaoRegua, atualizarRegua, obterPainelRegua } from "./regua-service";
import { conectarTwilio } from "./twilio-service";
import { processarWebhookTwilio } from "./twilio-webhook-service";
import { processarFilaWhatsapp } from "./whatsapp-fila";
import { processarWebhookAsaas } from "./asaas-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
delete process.env.TWILIO_MOCK;

usarBancoDeTeste();

const AGORA = new Date("2026-10-26T15:00:00.000Z");
const CHAVE_RESEND = "re_teste_local_nao_enviar_0001";
const CHAVE_ASAAS = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

let empresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(async () => {
  fetchSpy.mockClear();
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_CONTENT_SID_BOLETO_GERADO;
  delete process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS;
  delete process.env.TWILIO_CONTENT_SID_VENCEU;
  delete process.env.TWILIO_CONTENT_SID_PAGO;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa WhatsApp", cnpj: completarCnpj("592000000001") })).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono WhatsApp",
      email: `dono-${empresaId}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId,
      papel: "DONO",
    },
  });
});

function autor() {
  return {
    empresaId,
    papel: "DONO" as const,
    email: `dono-${empresaId}@exemplo.test`,
    nomeEmpresa: "Empresa WhatsApp",
  };
}

function pessoa(documento: string) {
  return {
    nomeFantasia: "Cliente da Régua",
    razaoSocial: "Cliente da Régua Ltda",
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "cliente.regua@exemplo.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function ligar(extra: Record<string, unknown> = {}) {
  return salvarConfiguracaoRegua(autor(), {
    ativa: true,
    modoTeste: true,
    remetenteNome: "Empresa WhatsApp",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "",
    chaveResend: CHAVE_RESEND,
    ...extra,
  });
}

async function passoComWhatsapp(dias = 0) {
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  return atualizarRegua(autor(), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: [
      {
        id: regua.passos[0]?.id,
        naEmissao: false,
        dias,
        canal: "EMAIL",
        assunto: "Sua cobrança",
        corpo: "Olá, {cliente}. {link}",
        enviarWhatsapp: true,
      },
    ],
  });
}

async function abrirFatura(clienteId: string, vencimento = "2026-10-26") {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date(`${vencimento}T00:00:00.000Z`),
      status: "PENDING",
      formaCobranca: "BOLETO",
      boletoUrl: "https://www.asaas.com/i/exemplo-boleto",
      descricao: "Serviço exemplo",
      criadoEm: new Date(`${vencimento}T15:00:00.000Z`),
    },
  });
}

describe("WhatsApp na régua via Twilio", () => {
  it("não remove o índice parcial de fatura em criação", async () => {
    const sql = readFileSync("prisma/migrations/20261030120000_whatsapp_twilio/migration.sql", "utf8");
    expect(sql).not.toMatch(/drop\s+/i);
    expect(sql).not.toMatch(/alter\s+table\s+"faturas"/i);
    const linhas = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'faturas_criando_por_cliente'
    `;
    expect(linhas[0]?.indexdef).toContain("(empresa_id, cliente_id)");
    expect(linhas[0]?.indexdef).toContain("CRIANDO");
  });

  it("cifra o token da subconta, publica quatro templates UTILITY e não chama a rede", async () => {
    const twilio = criarClienteTwilioMemoria();
    const painel = await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "123456789012345", coexistencia: true },
      { twilio },
    );
    expect(painel.conectada).toBe(true);
    expect(painel.senderStatus).toBe("ONLINE");
    expect(painel.coexistencia).toBe("SOLICITADA");
    expect(painel.templates.map((item) => item.tipo).sort()).toEqual(["BOLETO_GERADO", "PAGO", "VENCEU", "VENCE_EM_DIAS"]);
    expect(painel.templates.every((item) => item.status === "APROVADO")).toBe(true);
    expect(JSON.stringify(painel)).not.toContain(twilio.subcontas[0]?.authToken);
    expect(twilio.aprovacoes.every((item) => item.categoria === "UTILITY")).toBe(true);
    expect(twilio.chamouRede).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    const linha = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId } });
    expect(linha.authTokenCifrado.startsWith("v1:")).toBe(true);
    expect(decifrarSegredoAsaas(linha.authTokenCifrado)).toBe(twilio.subcontas[0]?.authToken);
    expect(linha.authTokenCifrado).not.toContain(twilio.subcontas[0]?.authToken ?? "ausente");
  });

  it("marca coexistência ativa quando a Twilio devolve e indisponível no erro 63110", async () => {
    const ativa = await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: true },
      { twilio: criarClienteTwilioMemoria({ coexistencia: "ATIVA" }) },
    );
    expect(ativa.coexistencia).toBe("ATIVA");

    await prisma.configuracaoTwilio.deleteMany({ where: { empresaId } });
    await prisma.templateWhatsapp.deleteMany({ where: { empresaId } });
    const indisponivel = await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: true },
      { twilio: criarClienteTwilioMemoria({ coexistencia: "INDISPONIVEL" }) },
    );
    expect(indisponivel.coexistencia).toBe("INDISPONIVEL");
    expect(indisponivel.senderStatus).toBe("FALHOU");
    expect(indisponivel.erro).toContain("63110");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no modo teste manda o template para o número de teste, uma vez, e respeita a régua pausada", async () => {
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio },
    );
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000003")));
    await abrirFatura(cliente.id);

    const primeiro = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(primeiro.enviados).toBe(1);
    expect(primeiro.whatsappEnviados).toBe(1);
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
    expect(twilio.enviados[0]?.variaveis["1"]).toBe("Cliente da Régua");
    expect(twilio.enviados[0]?.variaveis["4"]).toContain("asaas.com");
    expect(fetchSpy).not.toHaveBeenCalled();

    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados).toHaveLength(1);

    const outro = await criarCliente(empresaId, {
      ...pessoa(completarCnpj("592000000004")),
      nomeFantasia: "Cliente Pausado",
    });
    await prisma.cliente.update({ where: { id: outro.id }, data: { reguaPausada: true } });
    await abrirFatura(outro.id);
    const pausado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(pausado.whatsappEnviados).toBe(0);
    expect(twilio.enviados).toHaveLength(1);
    const ignorado = await prisma.filaWhatsapp.findFirst({
      where: { clienteId: outro.id, status: "IGNORADO" },
    });
    expect(ignorado?.motivo).toBe("régua pausada");
  });

  it("fora do modo teste o mock registra o cliente sem rede, e o opt-out segura o próximo", async () => {
    const twilio = criarClienteTwilioMemoria();
    await ligar({ modoTeste: false });
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio },
    );
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000005")));
    const fatura = await abrirFatura(cliente.id);
    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(fetchSpy).not.toHaveBeenCalled();

    const linha = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId } });
    const token = decifrarSegredoAsaas(linha.authTokenCifrado);
    const messageSid = twilio.enviados[0]?.sid ?? "";
    const parametros = {
      AccountSid: linha.subaccountSid,
      MessageSid: messageSid,
      MessageStatus: "failed",
      ErrorCode: "63003",
      From: `whatsapp:${linha.senderTelefone}`,
      To: "whatsapp:+5513988881001",
    };
    const assinatura = assinaturaTwilio(linha.webhookUrl, parametros, token);
    await expect(processarWebhookTwilio({ assinatura: "assinatura-invalida", parametros })).rejects.toMatchObject({
      status: 403,
    });
    const status = await processarWebhookTwilio({ assinatura, parametros });
    expect(status.duplicado).toBe(false);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: fatura.id } })).toMatchObject({ status: "FALHOU" });
    const deNovo = await processarWebhookTwilio({ assinatura, parametros });
    expect(deNovo.duplicado).toBe(true);

    const inbound = {
      AccountSid: linha.subaccountSid,
      MessageSid: "SMinboundoptout0000000000000001",
      From: "whatsapp:+5513988881001",
      To: `whatsapp:${linha.senderTelefone}`,
      Body: "PARAR",
      SmsStatus: "received",
    };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(linha.webhookUrl, inbound, token),
      parametros: inbound,
    });
    const opt = await prisma.optOutWhatsapp.findUniqueOrThrow({
      where: { empresaId_telefone: { empresaId, telefone: "5513988881001" } },
    });
    expect(opt.ativo).toBe(true);

    const segundo = await criarCliente(empresaId, {
      ...pessoa(completarCnpj("592000000006")),
      whatsapp: "13988881001",
      nomeFantasia: "Outro com o mesmo WhatsApp",
    });
    await abrirFatura(segundo.id);
    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enfileira o template de pago quando o Asaas confirma, sem chamar a Twilio", async () => {
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio },
    );
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000007")));
    await prisma.cliente.update({ where: { id: cliente.id }, data: { asaasCustomerId: "cus_whatsapp_1" } });
    const config = await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE_ASAAS });
    await processarWebhookAsaas(config.tokenWebhook ?? "", {
      id: "evt_pago_whatsapp_0001",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_whatsapp_pago_0001",
        customer: "cus_whatsapp_1",
        value: 150,
        dueDate: "2026-10-26",
        status: "RECEIVED",
        billingType: "BOLETO",
        invoiceUrl: "https://www.asaas.com/i/pago-exemplo",
      },
    });
    const fila = await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId, tipo: "PAGO" } });
    expect(fila.status).toBe("PENDENTE");
    expect(fila.modoTeste).toBe(true);
    await processarFilaWhatsapp({ empresaId, twilio });
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.contentSid.startsWith("HX")).toBe(true);
    expect(twilio.enviados[0]?.variaveis["4"]).toBe("https://www.asaas.com/i/pago-exemplo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no sandbox manda só para o número de teste, com a conta pai, sem Sender online", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    const sidPai = `HX${"b".repeat(32)}`;
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = sidPai;
    const { twilio, contas } = observarTwilio();
    await ligar();
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000008")));
    await abrirFatura(cliente.id);

    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.whatsappEnviados).toBe(1);
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.de).toBe("whatsapp:+14155238886");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
    expect(twilio.enviados[0]?.contentSid).toBe(sidPai);
    expect(contas).toEqual([process.env.TWILIO_ACCOUNT_SID]);
    expect(await prisma.configuracaoTwilio.findUnique({ where: { empresaId } })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem ContentSid da conta pai o sandbox espera e não chama a Twilio", async () => {
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000009")));
    await abrirFatura(cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.whatsappEnviados).toBe(0);
    expect(twilio.enviados).toHaveLength(0);
    const fila = await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId } });
    expect(fila.status).toBe("PENDENTE");
    expect(fila.modoTeste).toBe(true);
    expect(fila.motivo).toBe("sandbox sem ContentSid da conta pai");
    expect(fila.destino).toBe("whatsapp:+5511999990000");
  });

  it("com o sandbox ligado o Sender online continua na subconta e no ContentSid dela", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = `HX${"c".repeat(32)}`;
    const { twilio, contas } = observarTwilio();
    await ligar();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio },
    );
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000010")));
    await abrirFatura(cliente.id);
    await executarRegua({ agora: AGORA, empresaId, twilio });
    const linha = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId } });
    expect(twilio.enviados[0]?.de).toBe("whatsapp:+5511988887777");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.contentSid).not.toBe(process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS);
    expect(contas.at(-1)).toBe(linha.subaccountSid);
  });

  it("fora do modo teste o sandbox não envia para o cliente", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = `HX${"d".repeat(32)}`;
    const twilio = criarClienteTwilioMemoria();
    await ligar({ modoTeste: false });
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000011")));
    await abrirFatura(cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.whatsappEnviados).toBe(0);
    expect(twilio.enviados).toHaveLength(0);
    const fila = await prisma.filaWhatsapp.findFirstOrThrow({ where: { clienteId: cliente.id } });
    expect(fila.status).toBe("IGNORADO");
    expect(fila.motivo).toBe("WhatsApp não conectado");
    expect(fila.destino).toBeNull();
  });

  it("aceita o status do sandbox na conta pai e recusa a mesma chamada com o sandbox desligado", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000012")));
    const fatura = await abrirFatura(cliente.id);
    const fila = await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `wa:${empresaId}:${fatura.id}:sandbox:VENCE_EM_DIAS`,
        status: "ENVIADO",
        destino: "whatsapp:+5511999990000",
        messageSid: "SMsandboxstatus00000000000001",
        modoTeste: true,
        rotulo: "WhatsApp · vence em 0 dias",
        variaveis: "{}",
        disponivelEm: AGORA,
      },
    });
    const parametros = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: fila.messageSid ?? "",
      MessageStatus: "failed",
      ErrorCode: "63016",
      From: "whatsapp:+14155238886",
      To: "whatsapp:+5511999990000",
    };
    const assinatura = assinaturaTwilio(
      process.env.TWILIO_WEBHOOK_URL ?? "",
      parametros,
      process.env.TWILIO_AUTH_TOKEN ?? "",
    );
    const status = await processarWebhookTwilio({ assinatura, parametros });
    expect(status.duplicado).toBe(false);
    expect(await prisma.filaWhatsapp.findUniqueOrThrow({ where: { id: fila.id } })).toMatchObject({ status: "FALHOU" });

    delete process.env.TWILIO_WHATSAPP_SANDBOX;
    const outro = {
      ...parametros,
      MessageSid: "SMsandboxstatus00000000000002",
      MessageStatus: "delivered",
    };
    await expect(
      processarWebhookTwilio({
        assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", outro, process.env.TWILIO_AUTH_TOKEN ?? ""),
        parametros: outro,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

function observarTwilio(base: ClienteTwilioMemoria = criarClienteTwilioMemoria()) {
  const contas: string[] = [];
  const twilio: ClienteTwilioMemoria = {
    ...base,
    async enviarMensagem(conta: CredencialTwilio, mensagem) {
      contas.push(conta.accountSid);
      return base.enviarMensagem(conta, mensagem);
    },
  };
  return { twilio, contas };
}
