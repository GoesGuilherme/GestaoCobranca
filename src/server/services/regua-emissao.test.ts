import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/regua-emissao/route";
import { middleware } from "@/middleware";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { criarCliente } from "./cliente-service";
import { executarRegua } from "./regua-job";
import { atribuirReguaCliente, atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { conectarTwilio } from "./twilio-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;

usarBancoDeTeste();

const CHAVE = "re_teste_local_nao_enviar_0001";
const SID = `HX${"a".repeat(32)}`;
const PASSO_ID = "c76e720d7a0b870238b7b1057";
const DIARIO = new Date("2026-11-04T12:00:00.000Z");
const DEPOIS_DO_DIARIO = new Date("2026-11-04T13:30:00.000Z");
const HORA_SEGUINTE = new Date("2026-11-04T14:00:00.000Z");
const PASSO_CRIADO = new Date("2026-11-04T12:30:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

let empresaId = "";
const ambienteAnterior: Record<string, string | undefined> = {};

function guardarAmbiente() {
  for (const chave of [
    "TWILIO_WHATSAPP_SANDBOX",
    "TWILIO_WHATSAPP_TESTE",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WEBHOOK_URL",
    "TWILIO_CONTENT_SID_BOLETO_GERADO",
    "TWILIO_WHATSAPP_SENDER_OFICIAL",
    "CRON_SECRET",
  ]) {
    ambienteAnterior[chave] = process.env[chave];
  }
}

function restaurarAmbiente() {
  for (const [chave, valor] of Object.entries(ambienteAnterior)) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
}

function ligarSandbox() {
  process.env.TWILIO_WHATSAPP_SANDBOX = "true";
  process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
  process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
  process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = SID;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
  delete process.env.TWILIO_MOCK;
}

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  vi.stubGlobal("fetch", fetchSpy);
  guardarAmbiente();
});

afterEach(() => {
  restaurarAmbiente();
});

beforeEach(async () => {
  fetchSpy.mockClear();
  ligarSandbox();
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Emissão", cnpj: completarCnpj("594000000001") })).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono Emissão",
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
    nomeEmpresa: "Empresa Emissão",
  };
}

function pessoa(documento: string, email = "cliente.emissao@exemplo.test") {
  return {
    nomeFantasia: "Cliente da Emissão",
    razaoSocial: "Cliente da Emissão Ltda",
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function ligar(extra: Record<string, unknown> = {}) {
  return salvarConfiguracaoRegua(autor(), {
    ativa: true,
    modoTeste: false,
    remetenteNome: "Empresa Emissão",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "",
    chaveResend: CHAVE,
    ...extra,
  });
}

async function passosEmissao(extra: { vencimentoHoje?: boolean; whatsapp?: boolean; fimDeSemana?: boolean } = {}) {
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  const passos = [
    {
      naEmissao: true,
      dias: null,
      canal: "EMAIL" as const,
      assunto: "Boleto emitido",
      corpo: "Olá, {cliente}. Link {link}",
      enviarWhatsapp: extra.whatsapp ?? true,
    },
    ...(extra.vencimentoHoje
      ? [
          {
            naEmissao: false,
            dias: 0,
            canal: "EMAIL" as const,
            assunto: "Vence hoje",
            corpo: "Vence hoje, {cliente}",
            enviarWhatsapp: false,
          },
        ]
      : []),
  ];
  await atualizarRegua(autor(), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: extra.fimDeSemana ?? false,
    passos,
  });
  await prisma.passoRegua.updateMany({
    where: { empresaId, naEmissao: true },
    data: { criadoEm: PASSO_CRIADO },
  });
  const emissao = await prisma.passoRegua.findFirstOrThrow({ where: { empresaId, naEmissao: true } });
  await prisma.passoRegua.update({ where: { id: emissao.id }, data: { id: PASSO_ID } });
}

async function clienteDe(documento: string, email?: string) {
  return criarCliente(empresaId, pessoa(completarCnpj(documento), email));
}

async function vinculoDe(clienteId: string, nome: string) {
  const servico = await prisma.servico.create({
    data: { empresaId, nome, precoPadrao: "150.00" },
  });
  return prisma.clienteServico.create({
    data: {
      empresaId,
      clienteId,
      servicoId: servico.id,
      valor: "150.00",
      recorrencia: "MENSAL",
      inicioEm: new Date("2026-11-01T00:00:00.000Z"),
    },
  });
}

async function faturaDe(
  clienteId: string,
  parcial: {
    provedor?: "ASAAS" | "INTER";
    status?: string;
    criadoEm?: Date;
    boletoUrl?: string | null;
    faturaUrl?: string | null;
    excluida?: boolean;
    clienteServicoId?: string;
    vencimento?: string;
  } = {},
) {
  const provedor = parcial.provedor ?? "ASAAS";
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      provedor,
      asaasPaymentId: provedor === "ASAAS" ? `pay_${randomBytes(4).toString("hex")}` : null,
      idExterno: provedor === "INTER" ? `inter_${randomBytes(4).toString("hex")}` : null,
      clienteServicoId: parcial.clienteServicoId,
      valor: "150.00",
      vencimento: new Date(`${parcial.vencimento ?? "2026-11-20"}T00:00:00.000Z`),
      status: parcial.status ?? (provedor === "INTER" ? "A_RECEBER" : "PENDING"),
      formaCobranca: "BOLETO",
      boletoUrl: parcial.boletoUrl === undefined ? "https://exemplo.test/boleto" : parcial.boletoUrl,
      faturaUrl: parcial.faturaUrl ?? null,
      descricao: "Serviço exemplo",
      excluida: parcial.excluida ?? false,
      criadoEm: parcial.criadoEm ?? DEPOIS_DO_DIARIO,
    },
  });
}

describe("emissão da régua a cada hora", () => {
  it("pega a cobrança criada depois do cron diário e não repete e-mail nem WhatsApp", async () => {
    await ligar();
    await passosEmissao({ vencimentoHoje: true });
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa Emissão", wabaId: "", coexistencia: false },
      { twilio },
    );
    const opcoes = { empresaId, resend: caixa, twilio };

    await executarRegua({ ...opcoes, agora: DIARIO });
    expect(caixa.caixa).toHaveLength(0);

    const avulsaAsaas = await clienteDe("594000000011", "asaas.avulsa@exemplo.test");
    const recorrenteAsaas = await clienteDe("594000000012", "asaas.recorrente@exemplo.test");
    const avulsaInter = await clienteDe("594000000013", "inter.avulsa@exemplo.test");
    const recorrenteInter = await clienteDe("594000000014", "inter.recorrente@exemplo.test");
    const antiga = await clienteDe("594000000015", "antiga@exemplo.test");
    const antesDoPasso = await clienteDe("594000000016", "antes@exemplo.test");
    const vinculoAsaas = await vinculoDe(recorrenteAsaas.id, "PDV Asaas");
    const vinculoInter = await vinculoDe(recorrenteInter.id, "PDV Inter");

    await faturaDe(avulsaAsaas.id);
    await faturaDe(recorrenteAsaas.id, { clienteServicoId: vinculoAsaas.id });
    await faturaDe(avulsaInter.id, { provedor: "INTER" });
    await faturaDe(recorrenteInter.id, { provedor: "INTER", clienteServicoId: vinculoInter.id });
    await faturaDe(antiga.id, { criadoEm: new Date("2026-11-03T15:00:00.000Z") });
    await faturaDe(antiga.id, { criadoEm: new Date("2026-11-04T08:00:00.000Z") });
    await faturaDe(antesDoPasso.id, { criadoEm: new Date("2026-11-04T11:00:00.000Z") });

    const hora = await executarRegua({ ...opcoes, agora: HORA_SEGUINTE, somenteEmissao: true });
    expect(hora.enviados).toBe(4);
    expect(hora.whatsappEnviados).toBe(4);
    expect(caixa.caixa.map((item) => item.assunto).sort()).toEqual([
      "Boleto emitido",
      "Boleto emitido",
      "Boleto emitido",
      "Boleto emitido",
    ]);
    expect(caixa.caixa.map((item) => item.para).sort()).toEqual([
      "asaas.avulsa@exemplo.test",
      "asaas.recorrente@exemplo.test",
      "inter.avulsa@exemplo.test",
      "inter.recorrente@exemplo.test",
    ]);
    expect(twilio.enviados).toHaveLength(4);
    expect(twilio.enviados.every((item) => item.para === "whatsapp:+5513988881001")).toBe(true);
    expect(await prisma.lembreteRegua.count({ where: { empresaId, passoId: PASSO_ID, status: "ENVIADO" } })).toBe(4);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: antiga.id } })).toBe(0);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: antesDoPasso.id } })).toBe(0);

    await executarRegua({ ...opcoes, agora: HORA_SEGUINTE, somenteEmissao: true });
    await executarRegua({ ...opcoes, agora: new Date("2026-11-05T14:00:00.000Z") });
    expect(caixa.caixa).toHaveLength(4);
    expect(twilio.enviados).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a hora seguinte não manda o passo do vencimento; o cron diário manda, sem repetir a emissão", async () => {
    await ligar();
    await passosEmissao({ vencimentoHoje: true, whatsapp: false });
    const pessoaNova = await clienteDe("594000000021");
    await faturaDe(pessoaNova.id, { vencimento: "2026-11-04" });
    const caixa = clienteResendMemoria();

    const hora = await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true });
    expect(hora.enviados).toBe(1);
    expect(caixa.caixa.map((item) => item.assunto)).toEqual(["Boleto emitido"]);

    await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa });
    expect(caixa.caixa.map((item) => item.assunto)).toEqual(["Boleto emitido", "Vence hoje"]);
  });

  it("fora do horário espera a próxima hora permitida", async () => {
    await ligar();
    await passosEmissao({ whatsapp: false });
    const pessoaNova = await clienteDe("594000000031");
    const criada = new Date("2026-11-04T23:00:00.000Z");
    const fatura = await faturaDe(pessoaNova.id, { criadoEm: criada });
    const caixa = clienteResendMemoria();

    await executarRegua({ agora: criada, empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: fatura.id } })).toBe(0);

    await executarRegua({ agora: new Date("2026-11-05T11:00:00.000Z"), empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe("cliente.emissao@exemplo.test");
  });

  it("sábado e domingo mandam a emissão na hora e seguram o passo do vencimento", async () => {
    await ligar();
    await passosEmissao({ whatsapp: false, vencimentoHoje: true });
    await prisma.passoRegua.updateMany({
      where: { empresaId, naEmissao: true },
      data: { criadoEm: new Date("2026-11-07T12:00:00.000Z") },
    });
    const deSabado = await clienteDe("594000000041", "sabado@exemplo.test");
    const deDomingo = await clienteDe("594000000042", "domingo@exemplo.test");
    const deNoite = await clienteDe("594000000043", "noite@exemplo.test");
    const sabado = new Date("2026-11-07T15:00:00.000Z");
    const domingo = new Date("2026-11-08T15:00:00.000Z");
    await faturaDe(deSabado.id, { criadoEm: sabado, vencimento: "2026-11-07" });
    const caixa = clienteResendMemoria();

    const noSabado = await executarRegua({ agora: sabado, empresaId, resend: caixa, somenteEmissao: true });
    expect(noSabado.enviados).toBe(1);
    expect(caixa.caixa.map((item) => item.assunto)).toEqual(["Boleto emitido"]);

    await executarRegua({ agora: sabado, empresaId, resend: caixa });
    expect(caixa.caixa.map((item) => item.assunto)).toEqual(["Boleto emitido"]);

    await faturaDe(deDomingo.id, { criadoEm: domingo, vencimento: "2026-11-08" });
    const noDomingo = await executarRegua({ agora: domingo, empresaId, resend: caixa, somenteEmissao: true });
    expect(noDomingo.enviados).toBe(1);
    expect(caixa.caixa.map((item) => item.para).sort()).toEqual(["domingo@exemplo.test", "sabado@exemplo.test"]);

    const noite = new Date("2026-11-07T23:00:00.000Z");
    await faturaDe(deNoite.id, { criadoEm: noite });
    await executarRegua({ agora: noite, empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa.map((item) => item.para)).not.toContain("noite@exemplo.test");
    await executarRegua({ agora: new Date("2026-11-08T11:00:00.000Z"), empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa.map((item) => item.para)).toContain("noite@exemplo.test");
  });

  it("pula paga, cancelada, excluída e sem link, e manda quando o link chega", async () => {
    await ligar();
    await passosEmissao({ whatsapp: false });
    const pessoaNova = await clienteDe("594000000051");
    const caixa = clienteResendMemoria();
    await faturaDe(pessoaNova.id, { status: "RECEIVED" });
    await faturaDe(pessoaNova.id, { status: "PENDING", excluida: true });
    await faturaDe(pessoaNova.id, { provedor: "INTER", status: "CANCELADO" });
    await faturaDe(pessoaNova.id, { provedor: "INTER", status: "RECEBIDO" });
    const semLink = await faturaDe(pessoaNova.id, { boletoUrl: null, faturaUrl: null });

    await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: semLink.id } })).toBe(0);

    await prisma.fatura.update({ where: { id: semLink.id }, data: { faturaUrl: "https://exemplo.test/fatura" } });
    await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.texto).toContain("https://exemplo.test/fatura");
  });

  it("no modo teste o e-mail vai ao dono e o WhatsApp oficial vai ao número de teste", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SID;
    process.env.TWILIO_CONTENT_SID_VENCEU = SID;
    process.env.TWILIO_CONTENT_SID_PAGO = SID;
    await ligar({ modoTeste: true });
    await passosEmissao();
    const pessoaNova = await clienteDe("594000000061", "cliente.vivo@exemplo.test");
    await faturaDe(pessoaNova.id);
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();

    const resultado = await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, twilio, somenteEmissao: true });
    expect(resultado.enviados).toBe(1);
    expect(resultado.whatsappEnviados).toBe(1);
    expect(caixa.caixa[0]?.para).toBe(autor().email);
    expect(caixa.caixa[0]?.para).not.toBe("cliente.vivo@exemplo.test");
    expect(caixa.caixa[0]?.assunto.startsWith("[Teste] ")).toBe(true);
    expect(twilio.enviados[0]?.de).toBe("whatsapp:+16504762069");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("respeita pausa, nenhuma régua, bloqueio e opt-out", async () => {
    await ligar();
    await passosEmissao();
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    await conectarTwilio(
      autor(),
      { telefone: "11988887777", nomeExibicao: "Empresa Emissão", wabaId: "", coexistencia: false },
      { twilio },
    );
    const pausada = await clienteDe("594000000071", "pausada@exemplo.test");
    await prisma.cliente.update({ where: { id: pausada.id }, data: { reguaPausada: true } });
    await faturaDe(pausada.id);
    const bloqueada = await clienteDe("594000000072", "bloqueada@exemplo.test");
    await prisma.cliente.update({ where: { id: bloqueada.id }, data: { status: "BLOQUEADO" } });
    await faturaDe(bloqueada.id);
    const semRegua = await clienteDe("594000000073", "sem@exemplo.test");
    await atribuirReguaCliente(autor(), semRegua.id, { modo: "NENHUMA", pausada: false });
    await faturaDe(semRegua.id);
    const opt = await clienteDe("594000000074", "opt@exemplo.test");
    await prisma.optOutWhatsapp.create({
      data: { empresaId, telefone: "5513988881001", ativo: true, origem: "teste" },
    });
    await faturaDe(opt.id);

    const resultado = await executarRegua({
      agora: HORA_SEGUINTE,
      empresaId,
      resend: caixa,
      twilio,
      somenteEmissao: true,
    });
    expect(caixa.caixa.map((item) => item.para)).toEqual(["opt@exemplo.test"]);
    expect(resultado.whatsappEnviados).toBe(0);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: pausada.id, motivo: "régua pausada" } })).toBe(1);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: bloqueada.id, motivo: "cliente bloqueado" } })).toBe(1);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: semRegua.id, motivo: "sem régua" } })).toBe(1);
    expect(await prisma.filaWhatsapp.findFirst({ where: { clienteId: opt.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "opt-out",
    });
    expect(twilio.enviados).toHaveLength(0);
  });

  it("duas horas simultâneas não mandam o e-mail duas vezes", async () => {
    await ligar();
    await passosEmissao({ whatsapp: false });
    const pessoaNova = await clienteDe("594000000081");
    await faturaDe(pessoaNova.id);
    const caixa = clienteResendMemoria();
    await Promise.all([
      executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true }),
      executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true }),
    ]);
    expect(caixa.caixa).toHaveLength(1);
    expect(await prisma.lembreteRegua.count({ where: { empresaId, status: "ENVIADO" } })).toBe(1);
  });

  it("passa de 72 horas não entra, mesmo que o passo seja mais antigo que a cobrança", async () => {
    await ligar();
    await passosEmissao({ whatsapp: false });
    await prisma.passoRegua.updateMany({
      where: { empresaId, naEmissao: true },
      data: { criadoEm: new Date("2026-10-01T00:00:00.000Z") },
    });
    const pessoaNova = await clienteDe("594000000091", "velha@exemplo.test");
    const recente = await clienteDe("594000000092", "recente@exemplo.test");
    await faturaDe(pessoaNova.id, { criadoEm: new Date("2026-11-01T12:00:00.000Z") });
    await faturaDe(recente.id, { criadoEm: DEPOIS_DO_DIARIO });
    const caixa = clienteResendMemoria();
    await executarRegua({ agora: HORA_SEGUINTE, empresaId, resend: caixa, somenteEmissao: true });
    expect(caixa.caixa.map((item) => item.para)).toEqual(["recente@exemplo.test"]);
  });

  it("a rota horária exige o mesmo CRON_SECRET e o middleware deixa passar", async () => {
    const pedido = new NextRequest("http://127.0.0.1/api/cron/regua-emissao");
    expect((await middleware(pedido)).status).toBe(200);

    const anterior = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await cronGet(new Request("http://127.0.0.1/api/cron/regua-emissao"))).status).toBe(500);
    process.env.CRON_SECRET = "segredo-cron-de-teste";
    expect(
      (await cronPost(new Request("http://127.0.0.1/api/cron/regua-emissao", { method: "POST", headers: { authorization: "Bearer errado" } }))).status,
    ).toBe(401);
    const ok = await cronGet(
      new Request("http://127.0.0.1/api/cron/regua-emissao", { headers: { "x-cron-secret": "segredo-cron-de-teste" } }),
    );
    expect(ok.status).toBe(200);
    if (anterior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = anterior;
  });
});
