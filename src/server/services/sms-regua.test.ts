import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import { NUMERO_SMS_TWILIO } from "@/lib/sms-cobranca";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { criarCliente } from "./cliente-service";
import { executarRegua } from "./regua-job";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { processarWebhookTwilio } from "./twilio-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const AGORA = new Date("2026-10-26T15:00:00.000Z");
const CHAVE_RESEND = "re_teste_local_nao_enviar_0001";
const CHAVE_CIFRA = randomBytes(32).toString("base64");
const SID_TESTE = `AC${"b".repeat(32)}`;
const TOKEN_TESTE = "token-pai-de-teste-0001";
const WEBHOOK_TESTE = "https://taguaro.test/api/webhooks/twilio";

let empresaId = "";
let ambienteAnterior: Record<string, string | undefined> = {};

function guardarAmbiente() {
  ambienteAnterior = {
    ASAAS_ENCRYPTION_KEY: process.env.ASAAS_ENCRYPTION_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WEBHOOK_URL: process.env.TWILIO_WEBHOOK_URL,
    TWILIO_WHATSAPP_TESTE: process.env.TWILIO_WHATSAPP_TESTE,
    TWILIO_WHATSAPP_SANDBOX: process.env.TWILIO_WHATSAPP_SANDBOX,
    TWILIO_SMS_ENABLED: process.env.TWILIO_SMS_ENABLED,
    TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
    TWILIO_SMS_TESTE: process.env.TWILIO_SMS_TESTE,
  };
}

function restaurarAmbiente() {
  for (const [chave, valor] of Object.entries(ambienteAnterior)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
}

beforeEach(async () => {
  guardarAmbiente();
  process.env.ASAAS_ENCRYPTION_KEY = CHAVE_CIFRA;
  process.env.TWILIO_ACCOUNT_SID = SID_TESTE;
  process.env.TWILIO_AUTH_TOKEN = TOKEN_TESTE;
  process.env.TWILIO_WEBHOOK_URL = WEBHOOK_TESTE;
  delete process.env.TWILIO_SMS_ENABLED;
  delete process.env.TWILIO_SMS_FROM;
  delete process.env.TWILIO_SMS_TESTE;
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Padaria Sol", cnpj: completarCnpj("593000000001") })).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono SMS",
      email: `dono-${empresaId}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId,
      papel: "DONO",
    },
  });
});

afterEach(() => {
  restaurarAmbiente();
});

function autor() {
  return {
    empresaId,
    papel: "DONO" as const,
    email: `dono-${empresaId}@exemplo.test`,
    nomeEmpresa: "Padaria Sol",
  };
}

async function ligar(modoTeste: boolean) {
  return salvarConfiguracaoRegua(autor(), {
    ativa: true,
    modoTeste,
    remetenteNome: "Padaria Sol",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "",
    chaveResend: CHAVE_RESEND,
  });
}

async function passoComSms() {
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  if (!regua) throw new Error("Régua ausente.");
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
        dias: 0,
        canal: "EMAIL",
        assunto: "Sua cobrança",
        corpo: "Olá, {cliente}. {link}",
        enviarWhatsapp: false,
        enviarSms: true,
      },
    ],
  });
}

async function abrirFatura(clienteId: string) {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date("2026-10-26T00:00:00.000Z"),
      status: "PENDING",
      formaCobranca: "BOLETO",
      boletoUrl: "https://www.asaas.com/i/exemplo-boleto",
      descricao: "Serviço exemplo",
      criadoEm: new Date("2026-10-26T15:00:00.000Z"),
    },
  });
}

describe("SMS na régua", () => {
  it("com o canal desligado não chama a Twilio", async () => {
    const twilio = criarClienteTwilioMemoria();
    await ligar(true);
    await passoComSms();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente da Régua",
      razaoSocial: "Cliente da Régua Ltda",
      documento: completarCnpj("593000000002"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana",
      whatsapp: "13988881001",
      email: "cliente.sms@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.smsEnviados).toBe(0);
    expect(resultado.smsEnfileirados).toBe(0);
    expect(twilio.textos).toHaveLength(0);
    expect(await prisma.filaSms.count({ where: { empresaId } })).toBe(0);
    expect(twilio.chamouRede).toBe(false);
  });

  it("no modo teste manda só para o número de teste e recusa o do cliente", async () => {
    process.env.TWILIO_SMS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM = NUMERO_SMS_TWILIO;
    process.env.TWILIO_SMS_TESTE = "11945511449";
    const twilio = criarClienteTwilioMemoria();
    await ligar(true);
    await passoComSms();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Maria Exemplo",
      razaoSocial: "Maria Exemplo Ltda",
      documento: completarCnpj("593000000003"),
      segmento: "RESTAURANTE",
      contatoNome: "Maria",
      whatsapp: "13988881001",
      email: "maria.sms@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.smsEnviados).toBe(1);
    expect(twilio.textos).toHaveLength(1);
    expect(twilio.textos[0]).toMatchObject({
      de: NUMERO_SMS_TWILIO,
      para: "+5511945511449",
    });
    expect(twilio.textos[0]?.para).not.toBe("+5513988881001");
    expect(twilio.textos[0]?.para).not.toContain("whatsapp:");
    expect(twilio.textos[0]?.corpo.startsWith("Modo teste:")).toBe(true);
    expect(twilio.textos[0]?.corpo).toContain("Padaria Sol:");
    expect(twilio.textos[0]?.corpo).toContain("Maria Exemplo");
    expect(twilio.textos[0]?.corpo).toContain("R$ 150,00");
    expect(twilio.chamouRede).toBe(false);
    const fila = await prisma.filaSms.findFirstOrThrow({ where: { empresaId } });
    expect(fila.destino).toBe("+5511945511449");
    expect(fila.status).toBe("ENVIADO");
  });

  it("fora do modo teste não envia, mesmo com o canal ligado", async () => {
    process.env.TWILIO_SMS_ENABLED = "true";
    process.env.TWILIO_SMS_FROM = NUMERO_SMS_TWILIO;
    const twilio = criarClienteTwilioMemoria();
    await ligar(false);
    await passoComSms();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente Real",
      razaoSocial: "Cliente Real Ltda",
      documento: completarCnpj("593000000004"),
      segmento: "RESTAURANTE",
      contatoNome: "João",
      whatsapp: "13988881001",
      email: "real.sms@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(cliente.id);
    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.textos).toHaveLength(0);
    const fila = await prisma.filaSms.findFirstOrThrow({ where: { empresaId } });
    expect(fila.status).toBe("IGNORADO");
    expect(fila.destino).toBeNull();
    expect(fila.motivo).toBe("SMS só sai no modo teste");
    expect(twilio.chamouRede).toBe(false);
  });

  it("atualiza o status do SMS no webhook da Twilio e recusa assinatura inválida", async () => {
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente Webhook",
      razaoSocial: "Cliente Webhook Ltda",
      documento: completarCnpj("593000000005"),
      segmento: "RESTAURANTE",
      contatoNome: "Lia",
      whatsapp: "13988881001",
      email: "webhook.sms@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    const fatura = await abrirFatura(cliente.id);
    const fila = await prisma.filaSms.create({
      data: {
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `sms:${empresaId}:${fatura.id}:status`,
        status: "ENVIADO",
        destino: "+5511945511449",
        messageSid: "SMsmsstatus000000000000000001",
        modoTeste: true,
        rotulo: "SMS · vence hoje",
        corpo: "Padaria Sol: Olá.",
        disponivelEm: AGORA,
      },
    });
    const parametros = {
      AccountSid: SID_TESTE,
      MessageSid: fila.messageSid ?? "",
      MessageStatus: "undelivered",
      ErrorCode: "30003",
      From: NUMERO_SMS_TWILIO,
      To: "+5511945511449",
    };
    const url = WEBHOOK_TESTE;
    const token = TOKEN_TESTE;
    await expect(processarWebhookTwilio({ assinatura: "assinatura-invalida", parametros })).rejects.toMatchObject({
      status: 403,
    });
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(url, parametros, token),
      parametros,
    });
    expect(await prisma.filaSms.findUniqueOrThrow({ where: { id: fila.id } })).toMatchObject({
      status: "FALHOU",
      motivo: "Twilio 30003",
    });
  });
});
