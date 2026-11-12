import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import type { Acesso } from "@/server/auth/acesso";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { middleware } from "@/middleware";
import { prisma } from "@/server/db";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { REMETENTE_OFICIAL_WHATSAPP } from "@/server/twilio/sandbox";
import { aplicarRemetenteEmpresa, remetenteDaEmpresa } from "@/server/twilio/remetente";
import { criarCliente } from "./cliente-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { processarWebhookTwilio } from "./twilio-webhook-service";
import {
  atualizarNumeroTwilio,
  cadastrarNumeroTwilio,
  criarSubcontaTwilio,
  obterPainelTelefones,
  removerNumeroTwilio,
  atualizarStatusTemplatesWhatsapp,
  salvarTemplatesWhatsapp,
  vincularSubcontaExistente,
} from "./twilio-empresa-service";
import { enfileirarWhatsappDoPasso, processarFilaWhatsapp } from "./whatsapp-fila";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
delete process.env.TWILIO_MOCK;
delete process.env.TWILIO_CRIAR_SUBCONTA;

usarBancoDeTeste();

const SID_SUB = `AC${"c".repeat(32)}`;
const TOKEN_SUB = "token-subconta-teste-01";
const PAI = process.env.TWILIO_ACCOUNT_SID ?? "";

let empresaId = "";
let outraId = "";

beforeEach(async () => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.TWILIO_CRIAR_SUBCONTA;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
  delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
  delete process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Telefone", cnpj: completarCnpj("593000000001") })).id;
  outraId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra Telefone", cnpj: completarCnpj("593000000002") })).id;
});

afterEach(() => {
  delete process.env.TWILIO_CRIAR_SUBCONTA;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
  delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
  delete process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS;
});

function acesso(id: string, papel: Acesso["papel"] = "DONO"): Acesso {
  return {
    usuarioId: "usuario-telefone",
    nome: "Dono Telefone",
    email: "dono.telefone@exemplo.test",
    empresaId: id,
    nomeEmpresa: "Empresa Telefone",
    cnpjEmpresa: "59300000000100",
    papel,
    superadministrador: false,
  };
}

function twilioComModelos(
  modelos: { sid: string; aprovacao: string; motivo?: string | null }[],
  chamadas: string[] = [],
): ClienteTwilio {
  const base = criarClienteTwilioMemoria();
  return {
    ...base,
    async listarConteudosComAprovacao(conta) {
      chamadas.push(`lista:${conta.accountSid}`);
      return modelos.map((item) => ({
        sid: item.sid,
        aprovacao: item.aprovacao,
        motivo: item.motivo ?? null,
        categoria: "UTILITY",
        nome: "modelo",
      }));
    },
    async enviarMensagem() {
      chamadas.push("enviar");
      throw new Error("não envia");
    },
  };
}

function twilioQueConta(chamadas: string[]): ClienteTwilio {
  const base = criarClienteTwilioMemoria();
  return {
    ...base,
    async criarSubconta(pai, nome) {
      chamadas.push(`criar:${pai.accountSid}:${nome}`);
      return { sid: SID_SUB, authToken: TOKEN_SUB };
    },
    async obterSubconta(pai, sid) {
      chamadas.push(`obter:${pai.accountSid}:${sid}`);
      if (sid === pai.accountSid) {
        throw new Error("SID da conta pai");
      }
      return { sid, authToken: TOKEN_SUB, status: "active" };
    },
  };
}

describe("subconta e números da empresa", () => {
  it("cadastra, isola e remove números sem criar subconta e sem mudar o envio", async () => {
    const painel = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "11988887777", canal: "WHATSAPP" });
    expect(painel.subconta).toBeNull();
    expect(painel.criacaoHabilitada).toBe(false);
    expect(painel.envioWhatsapp).toBe("global");
    expect(painel.envioSms).toBe("global");
    expect(painel.numeros).toEqual([
      expect.objectContaining({
        telefoneE164: "+5511988887777",
        canal: "WHATSAPP",
        canalRotulo: "WhatsApp",
        status: "CADASTRADO",
        statusRotulo: "Cadastrado",
        padrao: true,
      }),
    ]);
    expect(await remetenteDaEmpresa(empresaId, "WHATSAPP")).toBeNull();

    await expect(cadastrarNumeroTwilio(acesso(empresaId, "FINANCEIRO"), { telefone: "+5511988887777", canal: "SMS" })).rejects.toMatchObject({
      status: 403,
    });
    await expect(cadastrarNumeroTwilio(acesso(empresaId), { telefone: "11988887777", canal: "WHATSAPP" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(cadastrarNumeroTwilio(acesso(empresaId), { telefone: "123", canal: "SMS" })).rejects.toMatchObject({
      status: 400,
    });

    const sms = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511988886666", canal: "SMS" });
    expect(sms.numeros).toHaveLength(2);
    const idWhats = painel.numeros[0]?.id ?? "";
    await expect(removerNumeroTwilio(acesso(outraId), idWhats)).rejects.toMatchObject({ status: 404 });
    expect((await obterPainelTelefones(acesso(outraId))).numeros).toEqual([]);

    const semWhats = await removerNumeroTwilio(acesso(empresaId), idWhats);
    expect(semWhats.numeros.map((item) => item.canal)).toEqual(["SMS"]);
    expect(await prisma.numeroTwilioEmpresa.count({ where: { empresaId: outraId } })).toBe(0);
  });

  it("recusa criar subconta com a flag desligada e não chama a Twilio", async () => {
    const chamadas: string[] = [];
    await expect(
      criarSubcontaTwilio(acesso(empresaId), {
        twilio: twilioQueConta(chamadas),
        env: { ...process.env, TWILIO_CRIAR_SUBCONTA: "" },
      }),
    ).rejects.toMatchObject({ status: 403, codigo: "twilio_subconta_desligada" });
    expect(chamadas).toEqual([]);
    expect(await prisma.subcontaTwilio.count()).toBe(0);
  });

  it("com a flag ligada guarda a credencial cifrada e o número ativo vira o remetente", async () => {
    const chamadas: string[] = [];
    const env = {
      ...process.env,
      TWILIO_CRIAR_SUBCONTA: "true",
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    const criada = await criarSubcontaTwilio(acesso(empresaId), { twilio: twilioQueConta(chamadas), env });
    expect(chamadas).toEqual([`criar:${PAI}:${`Taguaro ${empresaId}`.slice(0, 64)}`]);
    expect(criada.subconta).toMatchObject({
      sid: SID_SUB,
      status: "CONFIGURADA",
      statusRotulo: "Configurada",
      credencialMascarada: "••••e-01",
      legivel: true,
    });
    expect(JSON.stringify(criada)).not.toContain(TOKEN_SUB);
    const linha = await prisma.subcontaTwilio.findUniqueOrThrow({ where: { empresaId } });
    expect(linha.credencialCifrada).not.toContain(TOKEN_SUB);
    expect(linha.credencialCifrada.startsWith("v1:")).toBe(true);
    expect(decifrarSegredoAsaas(linha.credencialCifrada)).toBe(TOKEN_SUB);
    expect(await prisma.subcontaTwilio.count({ where: { empresaId: outraId } })).toBe(0);

    await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511988887777", canal: "WHATSAPP" });
    const aindaGlobal = await obterPainelTelefones(acesso(empresaId), env);
    expect(aindaGlobal.envioWhatsapp).toBe("global");

    const numero = aindaGlobal.numeros[0];
    if (!numero) throw new Error("número ausente");
    const ativo = await atualizarNumeroTwilio(acesso(empresaId), numero.id, { status: "ATIVO" });
    expect(ativo.numeros[0]).toMatchObject({ status: "ATIVO", statusRotulo: "Ativo", padrao: true });
    expect(ativo.envioWhatsapp).toBe("empresa");
    expect(ativo.envioSms).toBe("global");

    const remetente = await remetenteDaEmpresa(empresaId, "WHATSAPP", env);
    expect(remetente?.conta).toEqual({ accountSid: SID_SUB, authToken: TOKEN_SUB });
    expect(remetente?.de).toBe("whatsapp:+5511988887777");
    expect(await remetenteDaEmpresa(outraId, "WHATSAPP", env)).toBeNull();

    const global = { conta: { accountSid: PAI, authToken: "token-pai-de-teste-0001" }, de: REMETENTE_OFICIAL_WHATSAPP, statusCallback: "https://taguaro.test/api/webhooks/twilio" };
    expect(await aplicarRemetenteEmpresa(outraId, "WHATSAPP", global, env)).toMatchObject({ ...global, origem: "global" });
    expect((await aplicarRemetenteEmpresa(empresaId, "WHATSAPP", global, env)).origem).toBe("empresa");

    await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511988886666", canal: "SMS" });
    const sms = (await obterPainelTelefones(acesso(empresaId), env)).numeros.find((item) => item.canal === "SMS");
    if (!sms) throw new Error("sms ausente");
    await atualizarNumeroTwilio(acesso(empresaId), sms.id, { status: "ATIVO" });
    expect((await remetenteDaEmpresa(empresaId, "SMS", env))?.de).toBe("+5511988886666");

    const segundo = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511988885555", canal: "WHATSAPP" });
    const extra = segundo.numeros.find((item) => item.telefoneE164 === "+5511988885555");
    if (!extra) throw new Error("segundo número ausente");
    expect(extra.padrao).toBe(false);
    const trocado = await atualizarNumeroTwilio(acesso(empresaId), extra.id, { padrao: true, status: "ATIVO" });
    expect(trocado.numeros.find((item) => item.telefoneE164 === "+5511988887777")?.padrao).toBe(false);
    expect((await remetenteDaEmpresa(empresaId, "WHATSAPP", env))?.de).toBe("whatsapp:+5511988885555");
  });

  it("a fila usa a subconta ativa e, sem ela, o remetente global", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-01-01T00:00:00.000Z";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = `HX${"e".repeat(32)}`;
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente da Régua",
      razaoSocial: "Cliente da Régua Ltda",
      documento: completarCnpj("593000000003"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881001",
      email: "cliente.telefone@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
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
    async function enfileirar() {
      await prisma.filaWhatsapp.create({
        data: {
          empresaId,
          faturaId: fatura.id,
          clienteId: cliente.id,
          tipo: "VENCE_EM_DIAS",
          chaveIdempotencia: `wa:teste:${randomBytes(4).toString("hex")}`,
          status: "PENDENTE",
          destino: "whatsapp:+5513988881001",
          modoTeste: false,
          rotulo: "vence",
          variaveis: JSON.stringify({
            "1": "Cliente da Régua",
            "2": "R$ 150,00",
            "3": "5",
            "4": "26/10/2026",
            "5": "https://www.asaas.com/i/exemplo-boleto",
          }),
          disponivelEm: new Date("2026-10-26T15:00:00.000Z"),
        },
      });
    }
    function clienteQueGrava() {
      const base = criarClienteTwilioMemoria();
      const contas: CredencialTwilio[] = [];
      const twilio = {
        ...base,
        async enviarMensagem(conta: CredencialTwilio, mensagem: Parameters<ClienteTwilio["enviarMensagem"]>[1]) {
          contas.push(conta);
          return base.enviarMensagem(conta, mensagem);
        },
      };
      return { twilio, contas };
    }

    await enfileirar();
    const global = clienteQueGrava();
    const semSubconta = await processarFilaWhatsapp({
      agora: new Date("2026-10-26T16:00:00.000Z"),
      empresaId,
      twilio: global.twilio,
      conciliar: false,
    });
    expect(semSubconta.enviados).toBe(1);
    expect(global.contas.map((conta) => conta.accountSid)).toEqual([PAI]);
    expect(global.twilio.enviados[0]?.de).toBe(REMETENTE_OFICIAL_WHATSAPP);

    const env = {
      ...process.env,
      TWILIO_CRIAR_SUBCONTA: "true",
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    await criarSubcontaTwilio(acesso(empresaId), { twilio: twilioQueConta([]), env });
    const cadastrado = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511911112222", canal: "WHATSAPP" });
    const id = cadastrado.numeros[0]?.id ?? "";
    await enfileirar();
    const aindaGlobal = clienteQueGrava();
    await processarFilaWhatsapp({
      agora: new Date("2026-10-26T16:00:00.000Z"),
      empresaId,
      twilio: aindaGlobal.twilio,
      conciliar: false,
    });
    expect(aindaGlobal.contas.map((conta) => conta.accountSid)).toEqual([PAI]);
    expect(aindaGlobal.twilio.enviados[0]?.de).toBe(REMETENTE_OFICIAL_WHATSAPP);

    await atualizarNumeroTwilio(acesso(empresaId), id, { status: "ATIVO" });
    await prisma.templateWhatsapp.create({
      data: {
        empresaId,
        tipo: "VENCE_EM_DIAS",
        contentSid: `HX${"f".repeat(32)}`,
        nome: "taguaro_vence_em_dias_v2",
        corpo: "Olá, {{1}}. Texto {{5}}.",
        status: "RASCUNHO",
      },
    });
    await enfileirar();
    const daEmpresa = clienteQueGrava();
    const avisos: string[] = [];
    const info = console.info;
    console.info = (...args: unknown[]) => {
      avisos.push(args.map((item) => String(item)).join(" "));
    };
    let comSubconta: { enviados: number };
    try {
      comSubconta = await processarFilaWhatsapp({
        agora: new Date("2026-10-26T16:00:00.000Z"),
        empresaId,
        twilio: daEmpresa.twilio,
        conciliar: false,
      });
    } finally {
      console.info = info;
    }
    expect(comSubconta.enviados).toBe(1);
    expect(daEmpresa.contas.map((conta) => conta.accountSid)).toEqual([PAI]);
    expect(daEmpresa.twilio.enviados[0]?.de).toBe(REMETENTE_OFICIAL_WHATSAPP);
    expect(daEmpresa.twilio.enviados[0]?.contentSid).toBe(process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS);
    expect(daEmpresa.twilio.enviados[0]?.statusCallback).toBe("https://taguaro.test/api/webhooks/twilio");
    const filaFallback = await prisma.filaWhatsapp.findFirstOrThrow({
      where: { empresaId, messageSid: daEmpresa.twilio.enviados[0]?.sid },
    });
    expect(filaFallback.motivo).toContain("modelo aprovado");
    expect(avisos.join("\n")).toContain("whatsapp_fallback_subconta");
    expect(avisos.join("\n")).not.toContain(TOKEN_SUB);
  });

  it("com modelo aprovado a subconta ganha do número oficial e o webhook usa o token dela", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-01-01T00:00:00.000Z";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = `HX${"e".repeat(32)}`;
    const env = {
      ...process.env,
      TWILIO_CRIAR_SUBCONTA: "",
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    const chamadas: string[] = [];
    const twilioBusca = twilioQueConta(chamadas);
    await expect(
      vincularSubcontaExistente(acesso(empresaId, "FINANCEIRO"), { subaccountSid: SID_SUB }, { twilio: twilioBusca, env }),
    ).rejects.toMatchObject({ status: 403 });
    const painel = await vincularSubcontaExistente(acesso(empresaId), { subaccountSid: SID_SUB }, { twilio: twilioBusca, env });
    expect(chamadas).toEqual([`obter:${PAI}:${SID_SUB}`]);
    expect(JSON.stringify(painel)).not.toContain(TOKEN_SUB);
    expect(painel.criacaoHabilitada).toBe(false);
    expect(painel.subconta?.sid).toBe(SID_SUB);
    const linha = await prisma.subcontaTwilio.findUniqueOrThrow({ where: { empresaId } });
    expect(decifrarSegredoAsaas(linha.credencialCifrada)).toBe(TOKEN_SUB);
    expect(linha.credencialCifrada).not.toContain(TOKEN_SUB);
    await expect(
      vincularSubcontaExistente(acesso(empresaId), { subaccountSid: PAI }, { twilio: twilioBusca, env }),
    ).rejects.toMatchObject({ status: 400, codigo: "twilio_sid_pai" });

    const sidEmpresa = `HX${"a".repeat(32)}`;
    const chamadasModelo: string[] = [];
    const salvo = await salvarTemplatesWhatsapp(
      acesso(empresaId),
      { templates: [{ tipo: "VENCE_EM_DIAS", contentSid: sidEmpresa }] },
      { twilio: twilioComModelos([{ sid: sidEmpresa, aprovacao: "approved" }], chamadasModelo), env },
    );
    expect(chamadasModelo).toEqual([`lista:${SID_SUB}`]);
    expect(salvo.templates.find((item) => item.tipo === "VENCE_EM_DIAS")).toMatchObject({
      contentSid: sidEmpresa,
      status: "APROVADO",
      statusRotulo: "Aprovado",
    });
    await expect(
      salvarTemplatesWhatsapp(acesso(empresaId), { templates: [{ tipo: "PAGO", contentSid: "HXcurto" }] }),
    ).rejects.toMatchObject({ status: 400, codigo: "content_sid_invalido" });
    await expect(salvarTemplatesWhatsapp(acesso(empresaId, "FINANCEIRO"), { templates: [] })).rejects.toMatchObject({ status: 403 });

    const cadastrado = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+5511911112222", canal: "WHATSAPP" });
    await atualizarNumeroTwilio(acesso(empresaId), cadastrado.numeros[0]?.id ?? "", { status: "ATIVO" });
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente da Régua",
      razaoSocial: "Cliente da Régua Ltda",
      documento: completarCnpj("593000000004"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881001",
      email: "cliente.subconta@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
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
    await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `wa:sub:${randomBytes(4).toString("hex")}`,
        status: "PENDENTE",
        destino: "whatsapp:+5513988881001",
        modoTeste: false,
        rotulo: "vence",
        variaveis: JSON.stringify({
          "1": "Cliente da Régua",
          "2": "R$ 150,00",
          "3": "5",
          "4": "26/10/2026",
          "5": "https://www.asaas.com/i/exemplo-boleto",
        }),
        disponivelEm: new Date("2026-10-26T15:00:00.000Z"),
      },
    });
    const base = criarClienteTwilioMemoria();
    const contas: CredencialTwilio[] = [];
    const twilio = {
      ...base,
      async enviarMensagem(conta: CredencialTwilio, mensagem: Parameters<ClienteTwilio["enviarMensagem"]>[1]) {
        contas.push(conta);
        return base.enviarMensagem(conta, mensagem);
      },
    };
    const enviado = await processarFilaWhatsapp({
      agora: new Date("2026-10-26T16:00:00.000Z"),
      empresaId,
      twilio,
      conciliar: false,
    });
    expect(enviado.enviados).toBe(1);
    expect(contas).toEqual([{ accountSid: SID_SUB, authToken: TOKEN_SUB }]);
    expect(twilio.enviados[0]).toMatchObject({
      de: "whatsapp:+5511911112222",
      para: "whatsapp:+5513988881001",
      contentSid: sidEmpresa,
      statusCallback: "https://taguaro.test/api/webhooks/twilio",
    });
    expect(twilio.enviados[0]?.contentSid).not.toBe(process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS);
    const messageSid = twilio.enviados[0]?.sid ?? "";
    const parametros = {
      AccountSid: SID_SUB,
      MessageSid: messageSid,
      MessageStatus: "delivered",
      From: "whatsapp:+5511911112222",
      To: "whatsapp:+5513988881001",
    };
    const status = await processarWebhookTwilio({
      assinatura: assinaturaTwilio(env.TWILIO_WEBHOOK_URL, parametros, TOKEN_SUB),
      parametros,
    });
    expect(status).toMatchObject({ recebido: true, duplicado: false });
    expect(await prisma.eventoWhatsapp.findFirst({ where: { empresaId, messageSid } })).toMatchObject({ status: "delivered" });
    await expect(
      processarWebhookTwilio({
        assinatura: assinaturaTwilio(env.TWILIO_WEBHOOK_URL, parametros, env.TWILIO_AUTH_TOKEN),
        parametros,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("grava o status da Meta e não marca pendente como aprovado", async () => {
    const env = {
      ...process.env,
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    await vincularSubcontaExistente(acesso(empresaId), { subaccountSid: SID_SUB }, { twilio: twilioQueConta([]), env });
    const pendente = `HX${"1".repeat(32)}`;
    const recusado = `HX${"2".repeat(32)}`;
    const aprovado = `HX${"3".repeat(32)}`;
    const chamadas: string[] = [];
    const salvo = await salvarTemplatesWhatsapp(
      acesso(empresaId),
      {
        templates: [
          { tipo: "BOLETO_GERADO", contentSid: pendente },
          { tipo: "VENCEU", contentSid: recusado },
          { tipo: "PAGO", contentSid: aprovado },
        ],
      },
      {
        twilio: twilioComModelos(
          [
            { sid: pendente, aprovacao: "pending" },
            { sid: recusado, aprovacao: "rejected", motivo: "parâmetro no fim do texto" },
            { sid: aprovado, aprovacao: "approved" },
          ],
          chamadas,
        ),
        env,
      },
    );
    expect(chamadas).toEqual([`lista:${SID_SUB}`]);
    expect(JSON.stringify(salvo)).not.toContain(TOKEN_SUB);
    expect(salvo.templates.find((item) => item.tipo === "BOLETO_GERADO")).toMatchObject({
      contentSid: pendente,
      status: "ENVIADO_APROVACAO",
      statusRotulo: "Em aprovação",
      motivo: null,
    });
    expect(salvo.templates.find((item) => item.tipo === "VENCEU")).toMatchObject({
      contentSid: recusado,
      status: "REJEITADO",
      statusRotulo: "Rejeitado",
      motivo: "parâmetro no fim do texto",
    });
    expect(salvo.templates.find((item) => item.tipo === "PAGO")?.status).toBe("APROVADO");
    expect(await prisma.templateWhatsapp.findFirst({ where: { empresaId, tipo: "BOLETO_GERADO" } })).toMatchObject({
      status: "ENVIADO_APROVACAO",
    });

    await expect(
      salvarTemplatesWhatsapp(
        acesso(empresaId),
        { templates: [{ tipo: "VENCE_HOJE", contentSid: `HX${"4".repeat(32)}` }] },
        { twilio: twilioComModelos([], chamadas), env },
      ),
    ).rejects.toMatchObject({ status: 400, codigo: "content_sid_ausente" });
    expect(await prisma.templateWhatsapp.count({ where: { empresaId, tipo: "VENCE_HOJE" } })).toBe(0);
    expect(chamadas).not.toContain("enviar");

    const atualizado = await atualizarStatusTemplatesWhatsapp(acesso(empresaId), {
      twilio: twilioComModelos([{ sid: pendente, aprovacao: "approved" }, { sid: recusado, aprovacao: "rejected", motivo: "parâmetro no fim do texto" }, { sid: aprovado, aprovacao: "approved" }]),
      env,
    });
    expect(atualizado.templates.find((item) => item.tipo === "BOLETO_GERADO")).toMatchObject({
      contentSid: pendente,
      status: "APROVADO",
      statusRotulo: "Aprovado",
    });
    expect(atualizado.templates.find((item) => item.tipo === "VENCEU")?.motivo).toBe("parâmetro no fim do texto");
    await expect(atualizarStatusTemplatesWhatsapp(acesso(empresaId, "FINANCEIRO"), { env })).rejects.toMatchObject({ status: 403 });
    await expect(
      salvarTemplatesWhatsapp(acesso(outraId), { templates: [{ tipo: "PAGO", contentSid: aprovado }] }, { twilio: twilioComModelos([{ sid: aprovado, aprovacao: "approved" }]), env }),
    ).rejects.toMatchObject({ status: 400, codigo: "twilio_sem_subconta" });
  });

  it("passo com dias zero usa VENCE_HOJE aprovado e, sem ele, continua em VENCE_EM_DIAS", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-01-01T00:00:00.000Z";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = `HX${"e".repeat(32)}`;
    const env = {
      ...process.env,
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente da Régua",
      razaoSocial: "Cliente da Régua Ltda",
      documento: completarCnpj("593000000005"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881001",
      email: "cliente.hoje@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
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
    const regua = await prisma.reguaCobranca.create({
      data: {
        empresaId,
        nome: "Régua do dia",
        horaInicio: 8,
        horaFim: 18,
        passos: {
          create: {
            empresaId,
            ordem: 0,
            naEmissao: false,
            dias: 0,
            canal: "EMAIL",
            assunto: "Vence hoje",
            corpo: "Texto do passo",
            enviarWhatsapp: true,
          },
        },
      },
      include: { passos: true },
    });
    const passo = regua.passos[0];
    if (!passo) throw new Error("passo ausente");
    const linha = {
      ...fatura,
      boletoUrl: fatura.boletoUrl,
      faturaUrl: fatura.faturaUrl,
      cliente: {
        id: cliente.id,
        nomeFantasia: cliente.nomeFantasia,
        whatsapp: cliente.whatsapp,
        status: cliente.status,
        reguaModo: cliente.reguaModo,
        reguaPausada: cliente.reguaPausada,
      },
    };
    const agora = new Date("2026-10-26T16:00:00.000Z");
    expect(await enfileirarWhatsappDoPasso(linha, passo, false, agora)).toBe("enfileirado");
    const semSubconta = await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId, passoId: passo.id } });
    expect(semSubconta.tipo).toBe("VENCE_EM_DIAS");
    expect(JSON.parse(semSubconta.variaveis)).toMatchObject({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "3": "0",
      "4": "26/10/2026",
      "5": "https://www.asaas.com/i/exemplo-boleto",
    });

    await vincularSubcontaExistente(acesso(empresaId), { subaccountSid: SID_SUB }, { twilio: twilioQueConta([]), env });
    const numero = await cadastrarNumeroTwilio(acesso(empresaId), { telefone: "+551148633947", canal: "WHATSAPP" });
    await atualizarNumeroTwilio(acesso(empresaId), numero.numeros[0]?.id ?? "", { status: "ATIVO" });
    await prisma.filaWhatsapp.deleteMany({ where: { empresaId } });
    expect(await enfileirarWhatsappDoPasso(linha, passo, false, agora)).toBe("enfileirado");
    expect((await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId, passoId: passo.id } })).tipo).toBe("VENCE_EM_DIAS");

    const sidHoje = "HX578d21bad62d99aa8e22582067eb2ec2";
    await salvarTemplatesWhatsapp(
      acesso(empresaId),
      { templates: [{ tipo: "VENCE_HOJE", contentSid: sidHoje }] },
      { twilio: twilioComModelos([{ sid: sidHoje, aprovacao: "approved" }]), env },
    );
    await prisma.filaWhatsapp.deleteMany({ where: { empresaId } });
    expect(await enfileirarWhatsappDoPasso(linha, passo, false, agora)).toBe("enfileirado");
    const hoje = await prisma.filaWhatsapp.findFirstOrThrow({ where: { empresaId, passoId: passo.id } });
    expect(hoje.tipo).toBe("VENCE_HOJE");
    expect(hoje.rotulo).toBe("WhatsApp · vence hoje");
    const variaveis = JSON.parse(hoje.variaveis) as Record<string, string>;
    expect(variaveis).toEqual({
      "1": "Cliente da Régua",
      "2": "R$ 150,00",
      "3": "26/10/2026",
      "4": "https://www.asaas.com/i/exemplo-boleto",
    });
    expect(variaveis["5"]).toBeUndefined();

    const base = criarClienteTwilioMemoria();
    const contas: CredencialTwilio[] = [];
    const twilio = {
      ...base,
      async enviarMensagem(conta: CredencialTwilio, mensagem: Parameters<ClienteTwilio["enviarMensagem"]>[1]) {
        contas.push(conta);
        return base.enviarMensagem(conta, mensagem);
      },
    };
    const enviado = await processarFilaWhatsapp({ agora, empresaId, twilio, conciliar: false });
    expect(enviado.enviados).toBe(1);
    expect(contas).toEqual([{ accountSid: SID_SUB, authToken: TOKEN_SUB }]);
    expect(twilio.enviados[0]).toMatchObject({
      de: "whatsapp:+551148633947",
      contentSid: sidHoje,
      statusCallback: "https://taguaro.test/api/webhooks/twilio",
      variaveis,
    });
    expect(twilio.enviados[0]?.contentSid).not.toBe(process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS);
  });

  it("aceita o webhook da subconta e recusa o token da conta pai nesse SID", async () => {
    const env = {
      ...process.env,
      TWILIO_CRIAR_SUBCONTA: "true",
      TWILIO_ACCOUNT_SID: PAI,
      TWILIO_AUTH_TOKEN: "token-pai-de-teste-0001",
      TWILIO_WEBHOOK_URL: "https://taguaro.test/api/webhooks/twilio",
    };
    await criarSubcontaTwilio(acesso(empresaId), { twilio: twilioQueConta([]), env });
    const parametros = {
      AccountSid: SID_SUB,
      MessageSid: "SMsubconta000000000000000001",
      MessageStatus: "sent",
      From: "whatsapp:+5511911112222",
      To: "whatsapp:+5513988881001",
    };
    const ok = await processarWebhookTwilio({
      assinatura: assinaturaTwilio(env.TWILIO_WEBHOOK_URL, parametros, TOKEN_SUB),
      parametros,
    });
    expect(ok).toMatchObject({ recebido: true, duplicado: false });
    await expect(
      processarWebhookTwilio({
        assinatura: assinaturaTwilio(env.TWILIO_WEBHOOK_URL, parametros, env.TWILIO_AUTH_TOKEN),
        parametros,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("a tela e a API ficam só com o dono", async () => {
    const semSessao = await middleware(new NextRequest("http://127.0.0.1/telefones"));
    expect(semSessao.status).toBe(307);
    const financeiro = await emitirToken({
      sub: "usuario-financeiro-telefone",
      email: "financeiro.telefone@exemplo.test",
      nome: "Financeiro",
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
    });
    const bloqueado = await middleware(
      new NextRequest("http://127.0.0.1/telefones", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }),
    );
    expect(bloqueado.status).toBe(403);
    const api = await middleware(
      new NextRequest("http://127.0.0.1/api/telefones/subconta", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }),
    );
    expect(api.status).toBe(403);
    const dono = await emitirToken({
      sub: "usuario-dono-telefone",
      email: "dono.telefone@exemplo.test",
      nome: "Dono",
      empresaId,
      papel: "DONO",
      superadministrador: false,
    });
    const liberado = await middleware(
      new NextRequest("http://127.0.0.1/telefones", { headers: { cookie: `${COOKIE_SESSAO}=${dono}` } }),
    );
    expect(liberado.status).toBe(200);
  });
});
