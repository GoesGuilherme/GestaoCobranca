import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { completarCnpj } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import {
  textoConfirmacaoPromessa,
  textoDataEncerrada,
  textoNumeroNaoConfere,
  textoPedidoData,
  textoPrazoPromessa,
  textoPromessaExistente,
  tokenPromessaValido,
} from "@/lib/whatsapp-promessa";
import { prisma } from "@/server/db";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { criarCliente } from "./cliente-service";
import { obterConversa } from "./mensagens-service";
import { conciliarPromessas, faturaIdsComPromessaAtiva, registrarPromessa } from "./promessa-service";
import { emitirTokenPromessaWhatsapp } from "./promessa-whatsapp";
import { processarWebhookTwilio } from "./twilio-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";

usarBancoDeTeste();

const AGORA = new Date("2026-11-18T15:00:00.000Z");
const SID = `AC${"b".repeat(32)}`;
const SID_OUTRA = `AC${"c".repeat(32)}`;
const TOKEN = "token-sub-promessa-01";
const TOKEN_OUTRA = "token-sub-promessa-02";
const NUMERO = "+551148633947";
const WEBHOOK = "https://taguaro.test/api/webhooks/twilio";

let empresaId = "";
let outraEmpresaId = "";
let usuarioId = "";
let clienteId = "";
let faturaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.TWILIO_WEBHOOK_URL = WEBHOOK;
  delete process.env.TWILIO_MOCK;
  delete process.env.ASAAS_MOCK;
});

beforeEach(async () => {
  const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Empresa Chat", cnpj: completarCnpj("594000000001") });
  const outra = await criarEmpresaDeTeste({ nomeFantasia: "Outra Chat", cnpj: completarCnpj("594000000002") });
  empresaId = empresa.id;
  outraEmpresaId = outra.id;
  usuarioId = (
    await prisma.usuario.create({
      data: {
        nome: "Dono Chat",
        email: `dono-${empresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId,
        papel: "DONO",
      },
    })
  ).id;
  const cliente = await criarCliente(empresaId, pessoa(completarCnpj("594000000011"), "13988881001"));
  clienteId = cliente.id;
  faturaId = (await abrirFatura(empresaId, clienteId)).id;
  await ligarNumero(empresaId, SID, TOKEN, NUMERO);
  await ligarNumero(outraEmpresaId, SID_OUTRA, TOKEN_OUTRA, "+551148633948");
});

function pessoa(documento: string, whatsapp: string) {
  return {
    nomeFantasia: "Cliente do Chat",
    razaoSocial: "Cliente do Chat Ltda",
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp,
    email: "cliente.chat@exemplo.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function abrirFatura(empresa: string, cliente: string, valor = "150.00") {
  return prisma.fatura.create({
    data: {
      empresaId: empresa,
      clienteId: cliente,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor,
      vencimento: new Date("2026-11-10T00:00:00.000Z"),
      status: "OVERDUE",
      formaCobranca: "BOLETO",
      boletoUrl: "https://exemplo.test/cobranca",
      descricao: "Serviço exemplo",
    },
  });
}

async function ligarNumero(empresa: string, sid: string, token: string, telefone: string) {
  await prisma.subcontaTwilio.create({
    data: {
      empresaId: empresa,
      subaccountSid: sid,
      credencialCifrada: cifrarSegredoAsaas(token),
      credencialUltimos4: token.slice(-4),
      status: "CONFIGURADA",
    },
  });
  await prisma.numeroTwilioEmpresa.create({
    data: {
      empresaId: empresa,
      telefoneE164: telefone,
      canal: "WHATSAPP",
      status: "ATIVO",
      padrao: true,
    },
  });
}

function sid(): string {
  return `SM${randomBytes(16).toString("hex")}`.slice(0, 34);
}

async function entrar(dados: {
  twilio: ReturnType<typeof criarClienteTwilioMemoria>;
  sidConta?: string;
  tokenConta?: string;
  from?: string;
  to?: string;
  body?: string;
  payload?: string;
  agora?: Date;
}) {
  const parametros: Record<string, string> = {
    AccountSid: dados.sidConta ?? SID,
    MessageSid: sid(),
    From: dados.from ?? "whatsapp:+5513988881001",
    To: dados.to ?? `whatsapp:${NUMERO}`,
    Body: dados.body ?? "",
    SmsStatus: "received",
  };
  if (dados.payload !== undefined) parametros.ButtonPayload = dados.payload;
  const tokenConta = dados.tokenConta ?? TOKEN;
  return processarWebhookTwilio({
    assinatura: assinaturaTwilio(WEBHOOK, parametros, tokenConta),
    parametros,
    twilio: dados.twilio,
    agora: dados.agora ?? AGORA,
  });
}

function acesso() {
  return {
    usuarioId,
    nome: "Dono Chat",
    email: `dono-${empresaId}@exemplo.test`,
    empresaId,
    nomeEmpresa: "Empresa Chat",
    cnpjEmpresa: "00000000000000",
    papel: "DONO" as const,
    superadministrador: false,
  };
}

describe("promessa pelo WhatsApp", () => {
  it("registra amanhã com o token opaco, pausa a régua e quebra no dia seguinte", async () => {
    const token = await emitirTokenPromessaWhatsapp(empresaId, faturaId, AGORA);
    expect(token && tokenPromessaValido(token)).toBe(true);
    expect(token?.includes(faturaId)).toBe(false);
    const twilio = criarClienteTwilioMemoria();
    await entrar({ twilio, payload: token ?? "", body: "Registrar promessa" });
    expect(twilio.textos.map((item) => item.corpo)).toEqual([textoPedidoData("R$ 150,00")]);
    expect(await prisma.promessaPagamento.count()).toBe(0);

    await entrar({ twilio, payload: "", body: "Amanhã" });
    const promessa = await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId } });
    expect(promessa.origem).toBe("WHATSAPP");
    expect(promessa.canal).toBe("WHATSAPP");
    expect(promessa.registradaPorId).toBeNull();
    expect(promessa.status).toBe("PENDENTE");
    expect(promessa.valorPrometido.toFixed(2)).toBe("150.00");
    expect(promessa.dataPrometida.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(twilio.textos.at(-1)?.corpo).toBe(textoConfirmacaoPromessa("R$ 150,00", "2026-11-19"));
    expect(await faturaIdsComPromessaAtiva(empresaId, "2026-11-18")).toEqual(new Set([faturaId]));

    const deNovo = criarClienteTwilioMemoria();
    await entrar({ twilio: deNovo, payload: token ?? "" });
    expect(await prisma.promessaPagamento.count({ where: { faturaId, status: "PENDENTE" } })).toBe(1);
    expect(deNovo.textos[0]?.corpo).toBe(textoPromessaExistente());

    await conciliarPromessas(empresaId, "2026-11-20");
    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId } })).status).toBe("QUEBRADA");
    expect(await faturaIdsComPromessaAtiva(empresaId, "2026-11-20")).toEqual(new Set());

    const conversa = await obterConversa(acesso(), "5513988881001", { agora: AGORA, marcarLida: false });
    expect(conversa?.bolhas.some((bolha) => bolha.detalhe === "Pediu para registrar promessa")).toBe(true);
    expect(conversa?.bolhas.some((bolha) => bolha.detalhe === "Promessa registrada")).toBe(true);
    expect(conversa?.bolhas.some((bolha) => bolha.texto.startsWith("Anotado: pagamento de R$ 150,00 até 19/11") && bolha.detalhe === "Promessa de pagamento")).toBe(true);
    expect(conversa?.bolhas.some((bolha) => bolha.texto.includes(token ?? "token"))).toBe(false);
  });

  it("não registra número desconhecido, cliente trocado nem outra empresa", async () => {
    const token = await emitirTokenPromessaWhatsapp(empresaId, faturaId, AGORA);
    const outroCliente = await criarCliente(empresaId, pessoa(completarCnpj("594000000012"), "13988881009"));
    const twilio = criarClienteTwilioMemoria();
    await entrar({ twilio, payload: token ?? "", from: "whatsapp:+5513988881009" });
    expect(twilio.textos[0]?.corpo).toBe(textoNumeroNaoConfere());
    expect(await prisma.promessaPagamento.count()).toBe(0);
    expect(await prisma.conversaPromessaWhatsapp.count()).toBe(0);

    const desconhecido = criarClienteTwilioMemoria();
    await entrar({ twilio: desconhecido, payload: `pp1_${"B".repeat(43)}` });
    expect(desconhecido.textos[0]?.corpo).toBe(textoNumeroNaoConfere());
    expect(await prisma.promessaPagamento.count()).toBe(0);

    const vizinha = criarClienteTwilioMemoria();
    await entrar({
      twilio: vizinha,
      sidConta: SID_OUTRA,
      tokenConta: TOKEN_OUTRA,
      to: "whatsapp:+551148633948",
      payload: token ?? "",
    });
    expect(await prisma.promessaPagamento.count()).toBe(0);
    expect(await prisma.conversaPromessaWhatsapp.count({ where: { empresaId } })).toBe(0);
    expect(outroCliente.id).not.toBe(clienteId);
  });

  it("aceita outra data, recusa depois do prazo e desiste na terceira resposta inválida", async () => {
    const token = await emitirTokenPromessaWhatsapp(empresaId, faturaId, AGORA);
    const twilio = criarClienteTwilioMemoria();
    await entrar({ twilio, payload: token ?? "" });
    await entrar({ twilio, payload: "ppdata:outra", body: "Outra data" });
    await entrar({ twilio, payload: "", body: "20/11" });
    const promessa = await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId } });
    expect(promessa.dataPrometida.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(promessa.origem).toBe("WHATSAPP");

    await prisma.empresa.update({ where: { id: empresaId }, data: { prazoMaximoPromessaDias: 5 } });
    const curta = await abrirFatura(empresaId, clienteId, "80.00");
    const tokenCurto = await emitirTokenPromessaWhatsapp(empresaId, curta.id, AGORA);
    const limite = criarClienteTwilioMemoria();
    await entrar({ twilio: limite, payload: tokenCurto ?? "" });
    await entrar({ twilio: limite, payload: "", body: "Em 7 dias" });
    expect(limite.textos.at(-1)?.corpo).toBe(textoPrazoPromessa(5, "2026-11-23"));
    expect(await prisma.promessaPagamento.count({ where: { faturaId: curta.id } })).toBe(0);
    await entrar({ twilio: limite, payload: "", body: "Amanhã" });
    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: curta.id } })).dataPrometida.toISOString().slice(0, 10)).toBe("2026-11-19");

    const teimosa = await abrirFatura(empresaId, clienteId, "40.00");
    const tokenTeimoso = await emitirTokenPromessaWhatsapp(empresaId, teimosa.id, AGORA);
    const erros = criarClienteTwilioMemoria();
    await entrar({ twilio: erros, payload: tokenTeimoso ?? "" });
    await entrar({ twilio: erros, payload: "", body: "não sei" });
    await entrar({ twilio: erros, payload: "", body: "talvez" });
    await entrar({ twilio: erros, payload: "", body: "depois" });
    expect(erros.textos.at(-1)?.corpo).toBe(textoDataEncerrada());
    await entrar({ twilio: erros, payload: "", body: "Amanhã" });
    expect(await prisma.promessaPagamento.count({ where: { faturaId: teimosa.id } })).toBe(0);
  });

  it("a filial do cliente registra e o assessor não responde o botão", async () => {
    await prisma.filial.create({
      data: {
        clienteId,
        nome: "Loja",
        cnpj: completarCnpj("594000000021"),
        endereco: "Rua 1",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVA",
        whatsapp: "13988881002",
      },
    });
    await prisma.configuracaoAssessor.create({
      data: { empresaId, ativo: true, modoTeste: false },
    });
    const token = await emitirTokenPromessaWhatsapp(empresaId, faturaId, AGORA);
    const twilio = criarClienteTwilioMemoria();
    await entrar({ twilio, payload: token ?? "", from: "whatsapp:+5513988881002" });
    await entrar({ twilio, payload: "", body: "Em 3 dias", from: "whatsapp:+5513988881002" });
    const promessa = await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId } });
    expect(promessa.dataPrometida.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect(await prisma.mensagemAssessor.count({ where: { empresaId } })).toBe(0);

    const daTela = await abrirFatura(empresaId, clienteId, "10.00");
    const gravada = await registrarPromessa(
      {
        empresaId,
        papel: "DONO",
        usuarioId,
      },
      daTela.id,
      { dataPrometida: "2026-12-01", valorPrometido: "10.00", canal: "WHATSAPP" },
      AGORA,
    );
    expect(gravada.origem).toBe("PAINEL");
    expect(gravada.registradaPor).toBe("Dono Chat");
  });

  it("a conversa expirada não vira promessa", async () => {
    const token = await emitirTokenPromessaWhatsapp(empresaId, faturaId, AGORA);
    const twilio = criarClienteTwilioMemoria();
    await entrar({ twilio, payload: token ?? "" });
    const tarde = new Date(AGORA.getTime() + 3 * 60 * 60 * 1000);
    await entrar({ twilio, payload: "", body: "Amanhã", agora: tarde });
    expect(await prisma.promessaPagamento.count()).toBe(0);
    expect(await prisma.conversaPromessaWhatsapp.count()).toBe(0);
  });
});
