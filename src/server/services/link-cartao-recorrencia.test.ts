import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dataHojeIso, isoDeData } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import { diferencaDias, horaSaoPaulo } from "@/lib/regua";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { prisma } from "@/server/db";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { ativarRecorrencia } from "./recorrencia-service";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { executarRegua } from "./regua-job";
import { criarServico } from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;
usarBancoDeTeste();

const CHAVE_ASAAS = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const CHAVE_RESEND = "re_teste_local_nao_enviar_0001";
const SID_BOLETO = "HX0123456789abcdef0123456789abcdef";
const SID_DIAS = "HXabcdef0123456789abcdef0123456789";
const SID_VENCEU = "HX9876543210fedcba9876543210fedcba";
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
  process.env.TWILIO_ACCOUNT_SID = `AC${"b".repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
  process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
  process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
  process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
  process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2020-01-01T00:00:00.000Z";
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = SID_BOLETO;
  process.env.TWILIO_CONTENT_SID_VENCE_EM_DIAS = SID_DIAS;
  process.env.TWILIO_CONTENT_SID_VENCEU = SID_VENCEU;
  process.env.TWILIO_CONTENT_SID_PAGO = "HX03b0020228c822f3b8b7854b2be5b200";
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Cartão", cnpj: completarCnpj("581000000001") })).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono Cartão",
      email: `dono-${empresaId}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId,
      papel: "DONO",
    },
  });
});

function autor() {
  return { empresaId, papel: "DONO" as const };
}

function janelaForaDeAgora() {
  const hora = horaSaoPaulo(new Date());
  if (hora <= 1) return { horaInicio: 3, horaFim: 4 };
  return { horaInicio: 0, horaFim: 1 };
}

async function ligar(extra: { modoTeste?: boolean; whatsapp?: boolean; naEmissao?: boolean } = {}) {
  await salvarConfiguracaoRegua(autor(), {
    ativa: true,
    modoTeste: extra.modoTeste ?? false,
    remetenteNome: "Empresa Cartão",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE_RESEND,
  });
  const painel = await obterPainelRegua(autor());
  const regua = painel.reguas[0];
  const horas = janelaForaDeAgora();
  const naEmissao = extra.naEmissao ?? true;
  await atualizarRegua(autor(), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: horas.horaInicio,
    horaFim: horas.horaFim,
    enviarFimDeSemana: false,
    passos: [
      naEmissao
        ? {
            naEmissao: true,
            dias: null,
            canal: "EMAIL" as const,
            assunto: "Cadastre o cartão",
            corpo: "Olá, {cliente}. Cadastre o cartão em {link}",
            enviarWhatsapp: extra.whatsapp ?? true,
          }
        : {
            naEmissao: false,
            dias: 0,
            canal: "EMAIL" as const,
            assunto: "Vence hoje",
            corpo: "Olá, {cliente}. {link}",
            enviarWhatsapp: true,
          },
    ],
  });
}

async function venda(nome: string, documento: string) {
  await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE_ASAAS });
  const servico = await criarServico(autor(), { nome, precoPadrao: "130,00", ativo: true });
  const cliente = await criarCliente(empresaId, {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
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
  return { cliente, vinculo };
}

describe("link do cartão na criação da recorrência", () => {
  it("envia e-mail e WhatsApp na hora, fora do horário da régua, e não repete", async () => {
    await ligar();
    const { vinculo } = await venda("Cliente Teste", completarCnpj("581000000011"));
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const ativada = await ativarRecorrencia(
      autor(),
      vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("card"),
      { resend: caixa, twilio },
    );
    expect(ativada.recorrenciaAsaas?.cartaoStatus).toBe("AGUARDANDO");
    const fatura = await prisma.fatura.findFirstOrThrow({ where: { clienteServicoId: vinculo.id } });
    const dias = String(Math.max(0, diferencaDias(dataHojeIso(), isoDeData(fatura.vencimento))));
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe("ana.cartao@exemplo.test");
    expect(caixa.caixa[0]?.texto).toContain("sandbox.asaas.com/i/");
    expect(caixa.caixa[0]?.texto).not.toContain("Seu boleto");
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.contentSid).toBe(SID_DIAS);
    expect(twilio.enviados[0]?.contentSid).not.toBe(SID_BOLETO);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(twilio.enviados[0]?.variaveis["3"]).toBe(dias);
    expect(twilio.enviados[0]?.variaveis["5"]).toContain("sandbox.asaas.com/i/");
    expect(await prisma.lembreteRegua.findFirst({ where: { faturaId: fatura.id } })).toMatchObject({
      canal: "EMAIL",
      status: "ENVIADO",
      automatico: true,
      modoTeste: false,
      rotulo: "Na emissão",
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { faturaId: fatura.id } })).toMatchObject({
      tipo: "VENCE_EM_DIAS",
      status: "ENVIADO",
      rotulo: "WhatsApp · link do cartão",
      modoTeste: false,
    });

    await executarRegua({
      empresaId,
      resend: caixa,
      twilio,
      somenteEmissao: true,
      ignorarJanela: true,
      faturaIds: [fatura.id],
    });
    expect(caixa.caixa).toHaveLength(1);
    expect(twilio.enviados).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no modo teste não manda para o cliente", async () => {
    await ligar({ modoTeste: true });
    const { vinculo } = await venda("Cliente Teste", completarCnpj("581000000012"));
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    await ativarRecorrencia(
      autor(),
      vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("teste"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe(`dono-${empresaId}@exemplo.test`);
    expect(caixa.caixa[0]?.para).not.toBe("ana.cartao@exemplo.test");
    expect(caixa.caixa[0]?.assunto.startsWith("[Teste] ")).toBe(true);
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
    expect(await prisma.lembreteRegua.findFirst()).toMatchObject({ modoTeste: true, status: "ENVIADO" });
    expect(await prisma.filaWhatsapp.findFirst()).toMatchObject({ modoTeste: true, status: "ENVIADO" });
  });

  it("régua pausada, canal desligado, boleto e ausência do passo não disparam o link", async () => {
    await ligar();
    const pausada = await venda("Cliente Pausado", completarCnpj("581000000013"));
    await prisma.cliente.update({ where: { id: pausada.cliente.id }, data: { reguaPausada: true } });
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    await ativarRecorrencia(
      autor(),
      pausada.vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("pausa"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(0);
    expect(twilio.enviados).toHaveLength(0);
    expect(await prisma.lembreteRegua.findFirst({ where: { clienteId: pausada.cliente.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "régua pausada",
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { clienteId: pausada.cliente.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "régua pausada",
    });

    await ligar({ whatsapp: false });
    const semWhatsapp = await venda("Cliente E-mail", completarCnpj("581000000014"));
    await ativarRecorrencia(
      autor(),
      semWhatsapp.vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("email"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe("ana.cartao@exemplo.test");
    expect(await prisma.filaWhatsapp.count({ where: { clienteId: semWhatsapp.cliente.id } })).toBe(0);

    const boleto = await venda("Cliente Boleto", completarCnpj("581000000015"));
    await ativarRecorrencia(
      autor(),
      boleto.vinculo.id,
      { diaVencimento: 10, formaCobranca: "BOLETO", valor: "130,00" },
      new AsaasMemoria("boleto"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(1);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: boleto.cliente.id } })).toBe(0);

    await ligar({ naEmissao: false });
    const semPasso = await venda("Cliente Sem Passo", completarCnpj("581000000016"));
    await ativarRecorrencia(
      autor(),
      semPasso.vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("passo"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(1);
    expect(await prisma.lembreteRegua.count({ where: { clienteId: semPasso.cliente.id } })).toBe(0);
    expect(await prisma.filaWhatsapp.count({ where: { clienteId: semPasso.cliente.id } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cliente sem e-mail fica registrado e o WhatsApp segue", async () => {
    await ligar();
    const { cliente, vinculo } = await venda("Cliente Sem E-mail", completarCnpj("581000000017"));
    await prisma.cliente.update({ where: { id: cliente.id }, data: { email: "" } });
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    await ativarRecorrencia(
      autor(),
      vinculo.id,
      { diaVencimento: 10, formaCobranca: "CREDIT_CARD", valor: "130,00" },
      new AsaasMemoria("sememail"),
      { resend: caixa, twilio },
    );
    expect(caixa.caixa).toHaveLength(0);
    expect(twilio.enviados).toHaveLength(1);
    expect(await prisma.lembreteRegua.findFirst({ where: { clienteId: cliente.id } })).toMatchObject({
      status: "IGNORADO",
      motivo: "cliente sem e-mail",
    });
    expect(await prisma.filaWhatsapp.findFirst({ where: { clienteId: cliente.id } })).toMatchObject({
      status: "ENVIADO",
      rotulo: "WhatsApp · link do cartão",
    });
  });
});
