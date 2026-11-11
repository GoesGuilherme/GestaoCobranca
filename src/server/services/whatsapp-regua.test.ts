import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { completarCnpj } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import { prisma } from "@/server/db";
import { ErroTwilio, type CredencialTwilio } from "@/server/twilio/contrato";
import { criarClienteTwilioMemoria, type ClienteTwilioMemoria } from "@/server/twilio/memoria";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { obterFatura } from "./fatura-service";
import { clienteResendMemoria } from "@/server/regua/resend";
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
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
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

async function abrirFatura(clienteId: string, vencimento = "2026-10-26", criadoEm = `${vencimento}T15:00:00.000Z`) {
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
      criadoEm: new Date(criadoEm),
    },
  });
}

const SIDS_APROVADOS = {
  BOLETO_GERADO: "HXd3e534c278f4db0f03267127c8f8ea42",
  VENCE_EM_DIAS: "HX4222eefb650d475de02b869b421410b5",
  VENCEU: "HXe7e6427860caefa786bf34052f9b3847",
  PAGO: "HX03b0020228c822f3b8b7854b2be5b200",
} as const;

function aplicarSidsAprovados() {
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = SIDS_APROVADOS.BOLETO_GERADO;
  process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SIDS_APROVADOS.VENCE_EM_DIAS;
  process.env.TWILIO_CONTENT_SID_VENCEU = SIDS_APROVADOS.VENCEU;
  process.env.TWILIO_CONTENT_SID_PAGO = SIDS_APROVADOS.PAGO;
}

async function whatsappEmTodosOsPassos() {
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  return atualizarRegua(autor(), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: regua.passos.map((passo) => ({
      id: passo.id,
      naEmissao: passo.naEmissao,
      dias: passo.dias,
      canal: "EMAIL" as const,
      assunto: passo.assunto,
      corpo: passo.corpo,
      enviarWhatsapp: true,
    })),
  });
}

function twilioQueRecusa() {
  const base = criarClienteTwilioMemoria();
  let chamadas = 0;
  const twilio: ClienteTwilioMemoria = {
    ...base,
    async enviarMensagem() {
      chamadas += 1;
      throw new ErroTwilio("instabilidade", 503, null);
    },
  };
  return { twilio, chamadas: () => chamadas };
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
    expect(twilio.aprovacoes.map((item) => item.nome).sort()).toEqual([
      "taguaro_boleto_gerado_v2",
      "taguaro_pago_v2",
      "taguaro_vence_em_dias_v2",
      "taguaro_venceu_v2",
    ]);
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
    expect(twilio.enviados[0]?.variaveis["3"]).toBe("0");
    expect(twilio.enviados[0]?.variaveis["4"]).toBe("26/10/2026");
    expect(twilio.enviados[0]?.variaveis["5"]).toContain("asaas.com");
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

  it("manda os quatro eventos pelos ContentSids aprovados, só para o número de teste, sem rede", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    aplicarSidsAprovados();
    const { twilio, contas } = observarTwilio();
    await ligar();
    await whatsappEmTodosOsPassos();
    await prisma.passoRegua.updateMany({
      where: { empresaId, naEmissao: true },
      data: { criadoEm: new Date("2026-10-01T00:00:00.000Z") },
    });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000030")));
    await abrirFatura(cliente.id, "2026-10-26");
    await abrirFatura(cliente.id, "2026-10-31", "2026-10-01T15:00:00.000Z");
    await abrirFatura(cliente.id, "2026-10-23", "2026-10-01T15:00:00.000Z");

    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(resultado.whatsappEnviados).toBe(4);
    expect(twilio.enviados).toHaveLength(4);
    expect(twilio.enviados.every((item) => item.de === "whatsapp:+16504762069")).toBe(true);
    expect(twilio.enviados.every((item) => item.para === "whatsapp:+5511999990000")).toBe(true);
    expect(JSON.stringify(twilio.enviados)).not.toContain("13988881001");
    expect(contas.every((conta) => conta === process.env.TWILIO_ACCOUNT_SID)).toBe(true);

    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.BOLETO_GERADO)?.variaveis).toEqual({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "3": "26/10/2026",
      "4": "https://www.asaas.com/i/exemplo-boleto",
    });
    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.VENCE_EM_DIAS && item.variaveis["3"] === "5")?.variaveis).toEqual({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "3": "5",
      "4": "31/10/2026",
      "5": "https://www.asaas.com/i/exemplo-boleto",
    });
    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.VENCE_EM_DIAS && item.variaveis["3"] === "0")?.variaveis).toMatchObject({
      "3": "0",
      "4": "26/10/2026",
      "5": "https://www.asaas.com/i/exemplo-boleto",
    });
    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.VENCEU)?.variaveis).toEqual({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "3": "23/10/2026",
      "4": "https://www.asaas.com/i/exemplo-boleto",
    });

    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados).toHaveLength(4);

    await prisma.cliente.update({ where: { id: cliente.id }, data: { asaasCustomerId: "cus_whatsapp_oficial" } });
    const config = await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE_ASAAS });
    await processarWebhookAsaas(config.tokenWebhook ?? "", {
      id: "evt_pago_oficial_0001",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_whatsapp_oficial_0001",
        customer: "cus_whatsapp_oficial",
        value: 150,
        dueDate: "2026-10-20",
        status: "RECEIVED",
        billingType: "BOLETO",
        invoiceUrl: "https://www.asaas.com/i/pago-oficial",
      },
    });
    await processarFilaWhatsapp({ empresaId, twilio });
    const pago = twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.PAGO);
    expect(pago?.de).toBe("whatsapp:+16504762069");
    expect(pago?.para).toBe("whatsapp:+5511999990000");
    expect(pago?.variaveis).toMatchObject({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "4": "https://www.asaas.com/i/pago-oficial",
    });
    expect(twilio.enviados).toHaveLength(5);
    await processarFilaWhatsapp({ empresaId, twilio });
    expect(twilio.enviados).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem a data o Sender oficial não grava fila, e no modo teste ele prevalece sobre a subconta", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
    aplicarSidsAprovados();
    const bloqueado = criarClienteTwilioMemoria();
    await ligar({ modoTeste: false });
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000031")));
    await abrirFatura(cliente.id);
    const semSender = await executarRegua({ agora: AGORA, empresaId, twilio: bloqueado });
    expect(semSender.whatsappEnviados).toBe(0);
    expect(bloqueado.enviados).toHaveLength(0);
    expect(await prisma.filaWhatsapp.count({ where: { clienteId: cliente.id } })).toBe(0);

    await prisma.filaWhatsapp.deleteMany({ where: { empresaId } });
    const { twilio, contas } = observarTwilio();
    await ligar();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio },
    );
    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados[0]?.de).toBe("whatsapp:+16504762069");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.contentSid).toBe(SIDS_APROVADOS.VENCE_EM_DIAS);
    expect(contas.at(-1)).toBe(process.env.TWILIO_ACCOUNT_SID);

    await prisma.filaWhatsapp.deleteMany({ where: { empresaId } });
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-10-01T00:00:00.000Z";
    await ligar({ modoTeste: false });
    const producao = observarTwilio();
    await executarRegua({ agora: AGORA, empresaId, twilio: producao.twilio });
    expect(producao.twilio.enviados[0]?.de).toBe("whatsapp:+16504762069");
    expect(producao.twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(producao.twilio.enviados[0]?.para).not.toBe("whatsapp:+14155238886");
    expect(producao.twilio.enviados[0]?.contentSid).toBe(SIDS_APROVADOS.VENCE_EM_DIAS);
    expect(producao.contas.at(-1)).toBe(process.env.TWILIO_ACCOUNT_SID);
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
  });

  it("não cobra fatura paga, excluída ou inelegível e não reenvia o payload antigo", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SIDS_APROVADOS.VENCE_EM_DIAS;
    const { twilio, chamadas } = twilioQueRecusa();
    await ligar();
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000032")));
    const paga = await abrirFatura(cliente.id);
    const excluida = await abrirFatura(cliente.id);
    const inter = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "150.00",
        vencimento: new Date("2026-10-26T00:00:00.000Z"),
        status: "A_RECEBER",
        provedor: "INTER",
        formaCobranca: "BOLETO",
        boletoUrl: "https://www.asaas.com/i/exemplo-boleto",
        descricao: "Serviço exemplo",
        criadoEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });
    const jaPaga = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "150.00",
        vencimento: new Date("2026-10-26T00:00:00.000Z"),
        status: "RECEIVED",
        formaCobranca: "BOLETO",
        boletoUrl: "https://www.asaas.com/i/exemplo-boleto",
        descricao: "Serviço exemplo",
      },
    });
    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(chamadas()).toBe(3);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: jaPaga.id } })).toBe(0);

    await prisma.fatura.update({ where: { id: paga.id }, data: { status: "RECEIVED" } });
    await prisma.fatura.update({ where: { id: excluida.id }, data: { excluida: true } });
    await prisma.fatura.update({ where: { id: inter.id }, data: { status: "RECEBIDO" } });
    const segunda = await processarFilaWhatsapp({
      agora: new Date(AGORA.getTime() + 15 * 60 * 1000),
      empresaId,
      twilio,
    });
    expect(segunda.enviados).toBe(0);
    expect(chamadas()).toBe(3);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: paga.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "fatura paga",
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: excluida.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "fatura excluída",
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: inter.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "fatura paga",
    });

    const antigo = await abrirFatura(cliente.id, "2026-10-31", "2026-10-01T15:00:00.000Z");
    await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: antigo.id,
        clienteId: cliente.id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `wa:${empresaId}:${antigo.id}:antigo:VENCE_EM_DIAS`,
        status: "PENDENTE",
        destino: "whatsapp:+5511999990000",
        modoTeste: true,
        rotulo: "WhatsApp · vence em 5 dias",
        variaveis: JSON.stringify({
          "1": "Cliente da Régua",
          "2": "R$ 150,00",
          "3": "31/10/2026",
          "4": "https://www.asaas.com/i/exemplo-boleto",
          "5": "5",
        }),
        disponivelEm: AGORA,
      },
    });
    await processarFilaWhatsapp({ agora: new Date(AGORA.getTime() + 16 * 60 * 1000), empresaId, twilio });
    expect(chamadas()).toBe(3);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: antigo.id } })).toMatchObject({
      status: "FALHOU",
      motivo: "variáveis inválidas",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("repete a falha três vezes e não chama a Twilio de novo", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SIDS_APROVADOS.VENCE_EM_DIAS;
    const { twilio, chamadas } = twilioQueRecusa();
    await ligar();
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000033")));
    await abrirFatura(cliente.id);
    await executarRegua({ agora: AGORA, empresaId, twilio });
    await processarFilaWhatsapp({ agora: new Date(AGORA.getTime() + 15 * 60 * 1000), empresaId, twilio });
    await processarFilaWhatsapp({ agora: new Date(AGORA.getTime() + 30 * 60 * 1000), empresaId, twilio });
    await processarFilaWhatsapp({ agora: new Date(AGORA.getTime() + 60 * 60 * 1000), empresaId, twilio });
    expect(chamadas()).toBe(3);
    expect(await prisma.filaWhatsapp.findFirst({ where: { empresaId } })).toMatchObject({
      status: "FALHOU",
      tentativas: 3,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("processa só a empresa pedida e o webhook de uma não altera a fila da outra", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SIDS_APROVADOS.VENCE_EM_DIAS;
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000034")));
    await abrirFatura(cliente.id);

    const outra = await criarEmpresaDeTeste({ nomeFantasia: "Empresa Vizinha", cnpj: completarCnpj("592000000035") });
    await prisma.usuario.create({
      data: {
        nome: "Dono Vizinho",
        email: `dono-${outra.id}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId: outra.id,
        papel: "DONO",
      },
    });
    const acessoVizinho = {
      empresaId: outra.id,
      papel: "DONO" as const,
      email: `dono-${outra.id}@exemplo.test`,
      nomeEmpresa: "Empresa Vizinha",
    };
    await salvarConfiguracaoRegua(acessoVizinho, {
      ativa: true,
      modoTeste: true,
      remetenteNome: "Empresa Vizinha",
      remetenteEmail: "cobranca@exemplo.test",
      replyTo: "",
      chaveResend: CHAVE_RESEND,
    });
    const painelVizinho = await obterPainelRegua(acessoVizinho);
    const reguaVizinha = painelVizinho.reguas[0];
    await atualizarRegua(acessoVizinho, reguaVizinha.id, {
      nome: reguaVizinha.nome,
      padrao: true,
      horaInicio: 8,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [
        {
          id: reguaVizinha.passos[0]?.id,
          naEmissao: false,
          dias: 0,
          canal: "EMAIL",
          assunto: "Sua cobrança",
          corpo: "Olá, {cliente}. {link}",
          enviarWhatsapp: true,
        },
      ],
    });
    const clienteVizinho = await criarCliente(outra.id, {
      ...pessoa(completarCnpj("592000000036")),
      nomeFantasia: "Cliente Vizinho",
    });
    await prisma.fatura.create({
      data: {
        empresaId: outra.id,
        clienteId: clienteVizinho.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "80.00",
        vencimento: new Date("2026-10-26T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "BOLETO",
        boletoUrl: "https://www.asaas.com/i/vizinho",
        descricao: "Serviço vizinho",
        criadoEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });

    delete process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS;
    await executarRegua({ agora: AGORA, empresaId, twilio });
    await executarRegua({ agora: AGORA, empresaId: outra.id, twilio });
    expect(twilio.enviados).toHaveLength(0);
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SIDS_APROVADOS.VENCE_EM_DIAS;
    await processarFilaWhatsapp({
      agora: new Date(AGORA.getTime() + 60 * 60 * 1000),
      empresaId,
      twilio,
    });
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.variaveis["1"]).toBe("Cliente da Régua");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(await prisma.filaWhatsapp.findFirst({ where: { empresaId: outra.id } })).toMatchObject({ status: "PENDENTE" });

    const conectada = observarTwilio();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa WhatsApp", wabaId: "", coexistencia: false },
      { twilio: conectada.twilio },
    );
    await conectarTwilio(
      acessoVizinho,
      { telefone: "11977776666", nomeExibicao: "Empresa Vizinha", wabaId: "", coexistencia: false },
      { twilio: conectada.twilio },
    );
    const filaVizinha = await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId: outra.id } });
    await prisma.filaWhatsapp.update({
      where: { id: filaVizinha.id },
      data: { status: "ENVIADO", messageSid: "SMvizinho00000000000000000001", motivo: null },
    });
    const linhaNossa = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId } });
    const tokenNosso = decifrarSegredoAsaas(linhaNossa.authTokenCifrado);
    const cruzado = {
      AccountSid: linhaNossa.subaccountSid,
      MessageSid: "SMvizinho00000000000000000001",
      MessageStatus: "failed",
      ErrorCode: "63003",
      From: `whatsapp:${linhaNossa.senderTelefone}`,
      To: "whatsapp:+5511999990000",
    };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(linhaNossa.webhookUrl, cruzado, tokenNosso),
      parametros: cruzado,
    });
    expect(await prisma.filaWhatsapp.findUniqueOrThrow({ where: { id: filaVizinha.id } })).toMatchObject({
      status: "ENVIADO",
      motivo: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mostra a entrega do Sender oficial e recusa assinatura ou remetente fora do teste", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000037")));
    const fatura = await abrirFatura(cliente.id);
    const fila = await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        tipo: "PAGO",
        chaveIdempotencia: `wa:${empresaId}:${fatura.id}:pago:PAGO`,
        status: "ENVIADO",
        destino: "whatsapp:+5511999990000",
        messageSid: "SMoficialstatus0000000000001",
        modoTeste: true,
        rotulo: "WhatsApp · pago",
        variaveis: "{}",
        disponivelEm: AGORA,
      },
    });
    const enviado = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: fila.messageSid ?? "",
      MessageStatus: "sent",
      From: "whatsapp:+16504762069",
      To: "whatsapp:+5511999990000",
    };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", enviado, process.env.TWILIO_AUTH_TOKEN ?? ""),
      parametros: enviado,
    });
    const entregue = { ...enviado, MessageStatus: "delivered" };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", entregue, process.env.TWILIO_AUTH_TOKEN ?? ""),
      parametros: entregue,
    });
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", enviado, process.env.TWILIO_AUTH_TOKEN ?? ""),
      parametros: enviado,
    });
    expect(await prisma.filaWhatsapp.findUniqueOrThrow({ where: { id: fila.id } })).toMatchObject({
      status: "ENVIADO",
      motivo: "Twilio delivered",
    });
    const detalhe = await obterFatura(autor(), fatura.id);
    expect(detalhe.lembretes.find((item) => item.id === fila.id)).toMatchObject({
      canal: "WHATSAPP",
      status: "ENVIADO",
      motivo: "Twilio delivered",
      modoTeste: true,
    });

    const sandbox = { ...entregue, MessageSid: "SMoficialstatus0000000000002", From: "whatsapp:+14155238886", MessageStatus: "read" };
    await expect(
      processarWebhookTwilio({
        assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", sandbox, process.env.TWILIO_AUTH_TOKEN ?? ""),
        parametros: sandbox,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const invalida = { ...entregue, MessageStatus: "read" };
    await expect(
      processarWebhookTwilio({ assinatura: "assinatura-invalida", parametros: invalida }),
    ).rejects.toMatchObject({ status: 403 });

    delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
    await expect(
      processarWebhookTwilio({
        assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", entregue, process.env.TWILIO_AUTH_TOKEN ?? ""),
        parametros: entregue,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("produção manda só para o cliente desta fatura, honra opt-out e não reabre ignorado nem fila de teste", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-10-01T00:00:00.000Z";
    aplicarSidsAprovados();
    const twilio = criarClienteTwilioMemoria();
    await ligar({ modoTeste: false });
    await passoComWhatsapp(0);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000038")));
    const outro = await criarCliente(empresaId, {
      ...pessoa(completarCnpj("592000000039")),
      whatsapp: "11977776666",
      email: "outro.oficial@exemplo.test",
      nomeFantasia: "Outro Cliente",
    });
    const antiga = await abrirFatura(cliente.id, "2026-09-01", "2026-09-01T12:00:00.000Z");
    const fatura = await abrirFatura(cliente.id);
    const doOutro = await abrirFatura(outro.id);
    await prisma.optOutWhatsapp.create({
      data: { empresaId, telefone: "5511977776666", ativo: true, origem: "teste" },
    });
    await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `wa:${empresaId}:${fatura.id}:ignorada:VENCE_EM_DIAS`,
        status: "IGNORADO",
        motivo: "WhatsApp não conectado",
        modoTeste: false,
        rotulo: "WhatsApp · vence em 0 dias",
        variaveis: "{}",
        disponivelEm: AGORA,
      },
    });
    const passo = await prisma.passoRegua.findFirstOrThrow({ where: { empresaId, naEmissao: false } });
    await prisma.filaWhatsapp.update({
      where: { chaveIdempotencia: `wa:${empresaId}:${fatura.id}:ignorada:VENCE_EM_DIAS` },
      data: { chaveIdempotencia: `wa:${empresaId}:${fatura.id}:${passo.id}:VENCE_EM_DIAS`, passoId: passo.id },
    });

    await executarRegua({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados).toHaveLength(0);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: antiga.id } })).toBe(0);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: doOutro.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "opt-out",
    });

    const nova = await abrirFatura(cliente.id, "2026-10-27");
    await executarRegua({ agora: new Date("2026-10-27T15:00:00.000Z"), empresaId, twilio });
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.de).toBe("whatsapp:+16504762069");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(twilio.enviados.every((item) => item.para !== "whatsapp:+5511977776666")).toBe(true);

    const filaTeste = await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: nova.id,
        clienteId: cliente.id,
        tipo: "VENCEU",
        chaveIdempotencia: `wa:${empresaId}:${nova.id}:teste:VENCEU`,
        status: "PENDENTE",
        destino: "whatsapp:+5511999990000",
        modoTeste: true,
        rotulo: "WhatsApp · venceu",
        variaveis: JSON.stringify({ "1": "Cliente", "2": "R$ 1,00", "3": "01/10/2026", "4": "https://exemplo.test/b" }),
        disponivelEm: AGORA,
      },
    });
    await processarFilaWhatsapp({ agora: AGORA, empresaId, twilio });
    expect(twilio.enviados.at(-1)?.para).toBe("whatsapp:+5511999990000");
    expect(await prisma.filaWhatsapp.findUnique({ where: { id: filaTeste.id } })).toMatchObject({ modoTeste: true });

    await prisma.filaWhatsapp.update({
      where: { id: (await prisma.filaWhatsapp.findFirstOrThrow({ where: { faturaId: nova.id, modoTeste: false } })).id },
      data: { status: "ENVIADO", messageSid: "SMprodstatus0000000000000001", motivo: null },
    });
    const status = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: "SMprodstatus0000000000000001",
      MessageStatus: "delivered",
      From: "whatsapp:+16504762069",
      To: "whatsapp:+5513988881001",
    };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", status, process.env.TWILIO_AUTH_TOKEN ?? ""),
      parametros: status,
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { messageSid: status.MessageSid } })).toMatchObject({
      motivo: "Twilio delivered",
    });
    const parar = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: "SMprodinbound000000000000001",
      From: "whatsapp:+5513988881001",
      To: "whatsapp:+16504762069",
      Body: "PARAR",
      SmsStatus: "received",
    };
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", parar, process.env.TWILIO_AUTH_TOKEN ?? ""),
      parametros: parar,
    });
    expect(await prisma.optOutWhatsapp.findUnique({
      where: { empresaId_telefone: { empresaId, telefone: "5513988881001" } },
    })).toMatchObject({ ativo: true });
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("na emissão o WhatsApp de boleto não sai para Pix nem forma indefinida, e o cartão leva o link sem dizer boleto", async () => {
    process.env.TWILIO_WHATSAPP_SANDBOX = "true";
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-10-01T00:00:00.000Z";
    aplicarSidsAprovados();
    const twilio = criarClienteTwilioMemoria();
    const caixa = clienteResendMemoria();
    await ligar({ modoTeste: false });
    const painel = await obterPainelRegua(autor());
    const regua = painel.reguas[0];
    await atualizarRegua(autor(), regua.id, {
      nome: regua.nome,
      padrao: true,
      horaInicio: 8,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [
        {
          naEmissao: true,
          dias: null,
          canal: "EMAIL",
          assunto: "Cobrança emitida",
          corpo: "Olá, {cliente}. A cobrança está em {link}",
          enviarWhatsapp: true,
        },
      ],
    });
    await prisma.passoRegua.updateMany({
      where: { empresaId, naEmissao: true },
      data: { criadoEm: new Date("2026-10-01T00:00:00.000Z") },
    });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("592000000040")));
    const boleto = await abrirFatura(cliente.id);
    const cartao = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "20.00",
        vencimento: new Date("2026-11-07T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "CREDIT_CARD",
        faturaUrl: "https://www.asaas.com/i/cartao",
        descricao: "Licença PDVLegal",
        criadoEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });
    const pix = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "20.00",
        vencimento: new Date("2026-11-07T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "PIX",
        faturaUrl: "https://www.asaas.com/i/pix",
        descricao: "Licença PDVLegal",
        criadoEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });
    const indefinida = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "20.00",
        vencimento: new Date("2026-11-07T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "UNDEFINED",
        faturaUrl: "https://www.asaas.com/i/escolhe",
        descricao: "Licença PDVLegal",
        criadoEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });
    await executarRegua({ agora: AGORA, empresaId, twilio, resend: caixa });
    expect(caixa.caixa).toHaveLength(4);
    expect(caixa.caixa.every((item) => item.assunto === "Cobrança emitida")).toBe(true);
    expect(caixa.caixa.every((item) => item.texto.includes("A cobrança está em"))).toBe(true);
    expect(caixa.caixa.every((item) => !item.texto.includes("Seu boleto"))).toBe(true);
    expect(twilio.enviados).toHaveLength(2);
    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.BOLETO_GERADO)?.variaveis["4"]).toContain("asaas.com");
    expect(twilio.enviados.find((item) => item.contentSid === SIDS_APROVADOS.VENCE_EM_DIAS)).toMatchObject({
      variaveis: expect.objectContaining({
        "3": "12",
        "5": "https://www.asaas.com/i/cartao",
      }),
    });
    expect(twilio.enviados.every((item) => !JSON.stringify(item.variaveis).includes("Seu boleto"))).toBe(true);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: boleto.id, tipo: "BOLETO_GERADO" } })).toBe(1);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: cartao.id } })).toMatchObject({
      tipo: "VENCE_EM_DIAS",
      status: "ENVIADO",
      rotulo: "WhatsApp · link do cartão",
    });
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: { in: [pix.id, indefinida.id] } } })).toBe(0);
    await executarRegua({ agora: AGORA, empresaId, twilio, resend: caixa });
    expect(twilio.enviados).toHaveLength(2);
    expect(caixa.caixa).toHaveLength(4);
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
    expect(fetchSpy).not.toHaveBeenCalled();
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
