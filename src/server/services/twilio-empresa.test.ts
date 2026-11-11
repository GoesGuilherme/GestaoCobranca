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
} from "./twilio-empresa-service";
import { processarFilaWhatsapp } from "./whatsapp-fila";

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

function twilioQueConta(chamadas: string[]): ClienteTwilio {
  const base = criarClienteTwilioMemoria();
  return {
    ...base,
    async criarSubconta(pai, nome) {
      chamadas.push(`criar:${pai.accountSid}:${nome}`);
      return { sid: SID_SUB, authToken: TOKEN_SUB };
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
    await enfileirar();
    const daEmpresa = clienteQueGrava();
    const comSubconta = await processarFilaWhatsapp({
      agora: new Date("2026-10-26T16:00:00.000Z"),
      empresaId,
      twilio: daEmpresa.twilio,
      conciliar: false,
    });
    expect(comSubconta.enviados).toBe(1);
    expect(daEmpresa.contas).toEqual([{ accountSid: SID_SUB, authToken: TOKEN_SUB }]);
    expect(daEmpresa.twilio.enviados[0]?.de).toBe("whatsapp:+5511911112222");
    expect(daEmpresa.twilio.enviados[0]?.contentSid).toBe(process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS);
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
