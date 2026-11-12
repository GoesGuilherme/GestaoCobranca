import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dataHojeIso } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import { diferencaDias, somarDias } from "@/lib/regua";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { middleware } from "@/middleware";
import { prisma } from "@/server/db";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { enviarLinkCartaoManual } from "./link-cartao-manual";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { criarServico } from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;
usarBancoDeTeste();

const CHAVE_RESEND = "re_teste_local_nao_enviar_0001";
const SID_BOLETO = "HX0123456789abcdef0123456789abcdef";
const SID_DIAS = "HXabcdef0123456789abcdef0123456789";
const AGORA = new Date("2026-11-11T15:00:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

let empresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(async () => {
  fetchSpy.mockClear();
  delete process.env.TWILIO_MOCK;
  delete process.env.ASAAS_MOCK;
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
  delete process.env.TWILIO_WHATSAPP_FROM;
  process.env.TWILIO_ACCOUNT_SID = `AC${"c".repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
  process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
  process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
  process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
  process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2020-01-01T00:00:00.000Z";
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = SID_BOLETO;
  process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SID_DIAS;
  process.env.TWILIO_CONTENT_SID_VENCEU = "HX9876543210fedcba9876543210fedcba";
  process.env.TWILIO_CONTENT_SID_PAGO = "HX03b0020228c822f3b8b7854b2be5b200";
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Clique", cnpj: completarCnpj("582000000001") })).id;
});

function autor(papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO") {
  return {
    empresaId,
    papel,
    email: `dono-${empresaId}@exemplo.test`,
    nomeEmpresa: "Empresa Clique",
  };
}

async function ligar(extra: { modoTeste?: boolean; whatsapp?: boolean; ativa?: boolean } = {}) {
  await salvarConfiguracaoRegua(autor(), {
    ativa: extra.ativa ?? true,
    modoTeste: extra.modoTeste ?? false,
    remetenteNome: "Empresa Clique",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE_RESEND,
  });
  if (extra.ativa === false) return;
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  await atualizarRegua(autor(), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 0,
    horaFim: 1,
    enviarFimDeSemana: false,
    passos: [
      {
        naEmissao: true,
        dias: null,
        canal: "EMAIL",
        assunto: "Cadastre o cartão",
        corpo: "Olá, {cliente}. Cadastre o cartão em {link}",
        enviarWhatsapp: extra.whatsapp ?? true,
      },
    ],
  });
}

async function venda(documento: string, vencimento = somarDias(dataHojeIso(new Date()), 10)) {
  const servico = await criarServico(autor(), { nome: `Licença ${documento.slice(-4)}`, precoPadrao: "130,00", ativo: true });
  const cliente = await criarCliente(empresaId, {
    nomeFantasia: "Cliente Teste",
    razaoSocial: "Cliente Teste Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana.cartao@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  });
  const vinculo = await criarServicoDoCliente(autor(), cliente.id, {
    servicoId: servico.id,
    valor: "130,00",
    recorrencia: "MENSAL",
    inicioEm: "2026-11-11",
    status: "ATIVO",
  });
  const fatura = await prisma.fatura.create({
    data: {
      empresaId,
      clienteId: cliente.id,
      clienteServicoId: vinculo.id,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "130.00",
      vencimento: new Date(`${vencimento}T00:00:00.000Z`),
      status: "PENDING",
      formaCobranca: "CREDIT_CARD",
      faturaUrl: "https://www.asaas.com/i/cartao-manual",
      descricao: "Licença PDVLegal",
      criadoEm: new Date("2026-11-11T14:00:00.000Z"),
    },
  });
  return { cliente, vinculo, fatura };
}

describe("clique no link do cartão", () => {
  it("manda e-mail e WhatsApp fora do horário, registra e não repete no minuto", async () => {
    await ligar();
    const { fatura, vinculo } = await venda(completarCnpj("582000000011"));
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const agora = new Date();
    const opcoes = { agora, resend: caixa, twilio };
    const dias = String(diferencaDias(dataHojeIso(agora), somarDias(dataHojeIso(agora), 10)));

    const email = await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "EMAIL", opcoes);
    const whatsapp = await enviarLinkCartaoManual(autor(), { clienteServicoId: vinculo.id }, "WHATSAPP", opcoes);

    expect(email).toMatchObject({ resultado: "aceito", mensagem: "E-mail enviado.", modoTeste: false });
    expect(whatsapp).toMatchObject({ resultado: "aceito", mensagem: "WhatsApp enviado.", modoTeste: false });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe("ana.cartao@exemplo.test");
    expect(caixa.caixa[0]?.de).toContain("cobranca@exemplo.test");
    expect(caixa.caixa[0]?.texto).toContain("https://www.asaas.com/i/cartao-manual");
    expect(caixa.caixa[0]?.texto).not.toContain("Seu boleto");
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.contentSid).toBe(SID_DIAS);
    expect(twilio.enviados[0]?.contentSid).not.toBe(SID_BOLETO);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(twilio.enviados[0]?.variaveis).toMatchObject({ "3": dias, "5": "https://www.asaas.com/i/cartao-manual" });
    expect(await prisma.lembreteRegua.findFirst({ where: { faturaId: fatura.id, status: "ENVIADO" } })).toMatchObject({
      canal: "EMAIL",
      rotulo: "Link do cartão",
      automatico: false,
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: fatura.id, status: "ENVIADO" } })).toMatchObject({
      tipo: "VENCE_EM_DIAS",
      rotulo: "WhatsApp · link do cartão",
    });

    const deNovo = await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "EMAIL", opcoes);
    const deNovoWa = await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "WHATSAPP", opcoes);
    expect(deNovo.mensagem).toBe("Este envio já saiu agora.");
    expect(deNovoWa.mensagem).toBe("Este envio já saiu agora.");
    expect(caixa.caixa).toHaveLength(1);
    expect(twilio.enviados).toHaveLength(1);

    const depois = new Date(agora.getTime() + 61_000);
    await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "WHATSAPP", { ...opcoes, agora: depois });
    expect(twilio.enviados).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no modo teste não manda para o cliente", async () => {
    await ligar({ modoTeste: true });
    const { fatura } = await venda(completarCnpj("582000000012"));
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const opcoes = { agora: AGORA, resend: caixa, twilio };

    const email = await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "EMAIL", opcoes);
    const whatsapp = await enviarLinkCartaoManual(autor(), { faturaId: fatura.id }, "WHATSAPP", opcoes);

    expect(email.mensagem).toBe("Modo teste. O e-mail foi para você, não para o cliente.");
    expect(caixa.caixa[0]?.para).toBe(autor().email);
    expect(caixa.caixa[0]?.para).not.toBe("ana.cartao@exemplo.test");
    expect(caixa.caixa[0]?.assunto.startsWith("[Teste] ")).toBe(true);
    expect(whatsapp.mensagem).toBe("Modo teste. O WhatsApp foi para o número de teste, não para o cliente.");
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
  });

  it("mostra opt-out, cliente sem WhatsApp, canal desligado e pausa", async () => {
    await ligar();
    const opt = await venda(completarCnpj("582000000013"));
    await prisma.optOutWhatsapp.create({
      data: { empresaId, telefone: "5513988881001", ativo: true, origem: "teste" },
    });
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const opcoes = { agora: AGORA, resend: caixa, twilio };
    const bloqueado = await enviarLinkCartaoManual(autor(), { faturaId: opt.fatura.id }, "WHATSAPP", opcoes);
    expect(bloqueado).toMatchObject({ resultado: "ignorado", mensagem: "Opt-out." });
    expect(twilio.enviados).toHaveLength(0);
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: opt.fatura.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "opt-out",
    });
    const email = await enviarLinkCartaoManual(autor(), { faturaId: opt.fatura.id }, "EMAIL", opcoes);
    expect(email.resultado).toBe("aceito");

    const semNumero = await venda(completarCnpj("582000000014"));
    await prisma.cliente.update({ where: { id: semNumero.cliente.id }, data: { whatsapp: "" } });
    const sem = await enviarLinkCartaoManual(autor(), { faturaId: semNumero.fatura.id }, "WHATSAPP", opcoes);
    expect(sem.mensagem).toBe("Cliente sem WhatsApp.");
    expect(twilio.enviados).toHaveLength(0);

    await ligar({ whatsapp: false });
    const semCanal = await venda(completarCnpj("582000000015"));
    const canal = await enviarLinkCartaoManual(autor(), { faturaId: semCanal.fatura.id }, "WHATSAPP", opcoes);
    expect(canal.mensagem).toBe("Canal desligado.");
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: semCanal.fatura.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "Canal desligado.",
    });

    await ligar();
    const pausada = await venda(completarCnpj("582000000016"));
    await prisma.cliente.update({ where: { id: pausada.cliente.id }, data: { reguaPausada: true } });
    const pausa = await enviarLinkCartaoManual(autor(), { faturaId: pausada.fatura.id }, "EMAIL", opcoes);
    expect(pausa.mensagem).toBe("Régua pausada.");
    expect(caixa.caixa).toHaveLength(1);
    expect(await prisma.lembreteRegua.findFirst({ where: { faturaId: pausada.fatura.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "régua pausada",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recusa boleto e suporte, e o middleware segura a rota", async () => {
    await ligar();
    const { cliente, vinculo } = await venda(completarCnpj("582000000017"));
    const boleto = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        clienteServicoId: vinculo.id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "130.00",
        vencimento: new Date("2099-01-15T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "BOLETO",
        boletoUrl: "https://www.asaas.com/b/boleto",
        descricao: "Boleto",
      },
    });
    await expect(enviarLinkCartaoManual(autor(), { faturaId: boleto.id }, "EMAIL", { agora: AGORA })).rejects.toMatchObject({
      status: 409,
      codigo: "forma_indisponivel",
    });
    await expect(enviarLinkCartaoManual(autor("SUPORTE"), { faturaId: boleto.id }, "EMAIL")).rejects.toMatchObject({
      status: 403,
    });

    const suporte = await emitirToken({
      sub: "usuario-suporte",
      email: "suporte@exemplo.test",
      nome: "Suporte",
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
    });
    const bloqueado = await middleware(
      new NextRequest("http://127.0.0.1/api/servicos-cliente/venda123/link-cartao", {
        method: "POST",
        headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
      }),
    );
    expect(bloqueado.status).toBe(403);
    const anonimo = await middleware(new NextRequest("http://127.0.0.1/api/faturas/fatura123/link-cartao", { method: "POST" }));
    expect(anonimo.status).toBe(401);
  });
});
