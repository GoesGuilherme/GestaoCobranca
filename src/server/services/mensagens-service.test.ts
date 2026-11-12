import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTO_FORA_DA_JANELA, TEXTO_OPT_OUT, TEXTO_SEM_ENTRADA } from "@/lib/mensagens-twilio";
import { completarCnpj } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import type { Acesso } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { REMETENTE_OFICIAL_WHATSAPP } from "@/server/twilio/sandbox";
import { criarCliente } from "./cliente-service";
import {
  lerFiltroMensagens,
  listarConversas,
  listarMensagens,
  obterConversa,
  obterMensagem,
  responderWhatsapp,
} from "./mensagens-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { processarWebhookTwilio } from "./twilio-webhook-service";

process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;

usarBancoDeTeste();

const AGORA = new Date("2026-11-11T15:00:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

beforeAll(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(() => {
  fetchSpy.mockClear();
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
});

function acesso(empresaId: string, usuarioId: string, papel: Acesso["papel"] = "DONO"): Acesso {
  return {
    usuarioId,
    nome: "Marina Exemplo",
    email: "marina@exemplo.test",
    empresaId,
    nomeEmpresa: "Casa Exemplo",
    cnpjEmpresa: "00000000000100",
    papel,
    superadministrador: false,
  };
}

async function empresa(nome: string, cnpj: string) {
  const criada = await criarEmpresaDeTeste({ nomeFantasia: nome, cnpj: completarCnpj(cnpj) });
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Dono",
      email: `dono-${criada.id}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId: criada.id,
      papel: "DONO",
    },
  });
  return { empresa: criada, usuario };
}

async function pessoa(empresaId: string, nome: string, whatsapp: string, raiz: string) {
  return criarCliente(empresaId, {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento: completarCnpj(raiz),
    segmento: "RESTAURANTE",
    contatoNome: "Ana",
    whatsapp,
    email: `${whatsapp}@exemplo.test`,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
  });
}

async function fatura(empresaId: string, clienteId: string, descricao: string) {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date("2026-11-20T00:00:00.000Z"),
      status: "PENDING",
      formaCobranca: "BOLETO",
      descricao,
      boletoUrl: "https://exemplo.test/boleto",
    },
  });
}

async function fila(dados: {
  empresaId: string;
  faturaId: string;
  clienteId: string;
  status: string;
  motivo?: string | null;
  destino?: string | null;
  messageSid?: string | null;
  rotulo?: string;
  tipo?: string;
  criadoEm?: Date;
  passoId?: string | null;
  variaveis?: string;
}) {
  return prisma.filaWhatsapp.create({
    data: {
      empresaId: dados.empresaId,
      faturaId: dados.faturaId,
      clienteId: dados.clienteId,
      passoId: dados.passoId,
      tipo: dados.tipo ?? "VENCE_EM_DIAS",
      chaveIdempotencia: `wa:${randomBytes(8).toString("hex")}`,
      status: dados.status,
      destino: dados.destino === undefined ? "whatsapp:+5513988881001" : dados.destino,
      messageSid: dados.messageSid,
      motivo: dados.motivo,
      modoTeste: false,
      rotulo: dados.rotulo ?? "WhatsApp · vence em 3 dias",
      variaveis: dados.variaveis ?? JSON.stringify({ "1": "Padaria", "2": "R$ 150,00" }),
      disponivelEm: AGORA,
      criadoEm: dados.criadoEm,
    },
  });
}

function assinar(parametros: Record<string, string>) {
  return assinaturaTwilio(process.env.TWILIO_WEBHOOK_URL ?? "", parametros, process.env.TWILIO_AUTH_TOKEN ?? "");
}

describe("monitor de mensagens da Twilio", () => {
  it("lista só a empresa logada, com status em português e o passo da régua", async () => {
    const casa = await empresa("Casa", "200000000001");
    const vizinha = await empresa("Vizinha", "200000000002");
    const cliente = await pessoa(casa.empresa.id, "Padaria do Cais", "13988881001", "300000000001");
    const outro = await pessoa(vizinha.empresa.id, "Mercado Vizinho", "11977776666", "300000000002");
    const cobranca = await fatura(casa.empresa.id, cliente.id, "Mensalidade de novembro");
    const regua = await prisma.reguaCobranca.create({
      data: { empresaId: casa.empresa.id, nome: "Padrão", padrao: true },
    });
    const passo = await prisma.passoRegua.create({
      data: {
        reguaId: regua.id,
        empresaId: casa.empresa.id,
        ordem: 1,
        naEmissao: false,
        dias: -3,
        canal: "EMAIL",
        assunto: "3 dias antes",
        corpo: "Oi",
      },
    });
    const lida = await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "ENVIADO",
      motivo: "Twilio read",
      messageSid: "SMlida000000000000000000000001",
      passoId: passo.id,
      criadoEm: new Date("2026-11-10T15:00:00.000Z"),
    });
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId: casa.empresa.id,
        filaId: lida.id,
        messageSid: lida.messageSid ?? "",
        tipo: "STATUS",
        status: "read",
      },
    });
    await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "FALHOU",
      motivo: "Twilio 63003",
      messageSid: "SMfalha00000000000000000000001",
      criadoEm: new Date("2026-11-09T15:00:00.000Z"),
    });
    await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "ENVIADO",
      destino: "+5513988881001",
      messageSid: "SMsms0000000000000000000000001",
      tipo: "VENCEU",
      rotulo: "SMS de atraso",
      criadoEm: new Date("2026-11-08T15:00:00.000Z"),
    });
    const faturaVizinha = await fatura(vizinha.empresa.id, outro.id, "Outra");
    await fila({
      empresaId: vizinha.empresa.id,
      faturaId: faturaVizinha.id,
      clienteId: outro.id,
      status: "ENVIADO",
      destino: "whatsapp:+5511977776666",
      messageSid: "SMvizinha000000000000000000001",
    });

    const autor = acesso(casa.empresa.id, casa.usuario.id);
    const filtro = lerFiltroMensagens({ periodo: "todos" }, "2026-11-11");
    const lista = await listarMensagens(autor, filtro);
    expect(lista.itens.map((item) => item.cliente)).not.toContain("Mercado Vizinho");
    expect(lista.itens.find((item) => item.id === lida.id)).toMatchObject({
      status: "LIDA",
      statusRotulo: "Lida",
      envio: "Régua · Padrão · 3 dias antes",
      canal: "WHATSAPP",
      fatura: "Mensalidade de novembro",
    });
    const falha = lista.itens.find((item) => item.status === "FALHOU");
    expect(falha?.motivo).toContain("63003");
    expect(falha?.motivo).toContain("não encontrou este número");

    const soLidas = await listarMensagens(autor, { ...filtro, status: "LIDA" });
    expect(soLidas.itens).toHaveLength(1);
    const sms = await listarMensagens(autor, { ...filtro, canal: "SMS" });
    expect(sms.itens.map((item) => item.canal)).toEqual(["SMS"]);
    const busca = await listarMensagens(autor, { ...filtro, busca: "cais" });
    expect(busca.itens.length).toBeGreaterThan(0);
    expect(busca.itens.every((item) => item.clienteId === cliente.id)).toBe(true);
    const recente = await listarMensagens(autor, lerFiltroMensagens({ periodo: "7" }, "2026-11-11"));
    expect(recente.itens.some((item) => item.id === lida.id)).toBe(true);
    const antiga = await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "PENDENTE",
      criadoEm: new Date("2026-01-01T15:00:00.000Z"),
    });
    const seteDias = await listarMensagens(autor, lerFiltroMensagens({ periodo: "7" }, "2026-11-11"));
    expect(seteDias.itens.some((item) => item.id === antiga.id)).toBe(false);

    await expect(listarMensagens(acesso(casa.empresa.id, casa.usuario.id, "SUPORTE"), filtro)).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("guarda o texto do erro no webhook e abre o detalhe da mensagem", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    const casa = await empresa("Casa Status", "200000000003");
    const cliente = await pessoa(casa.empresa.id, "Quitanda", "13988881002", "300000000003");
    const cobranca = await fatura(casa.empresa.id, cliente.id, "Taxa");
    const linha = await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "ENVIADO",
      motivo: null,
      messageSid: "SMstatus0000000000000000000001",
      destino: "whatsapp:+5513988881002",
    });
    const parametros = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: linha.messageSid ?? "",
      MessageStatus: "failed",
      From: REMETENTE_OFICIAL_WHATSAPP,
      To: "whatsapp:+5513988881002",
      ErrorCode: "63016",
      ErrorMessage: "Outside the allowed window",
    };
    await processarWebhookTwilio({ assinatura: assinar(parametros), parametros });
    const detalhe = await obterMensagem(acesso(casa.empresa.id, casa.usuario.id), linha.id);
    expect(detalhe?.status).toBe("FALHOU");
    expect(detalhe?.motivo).toContain("63016");
    expect(detalhe?.motivo).toContain("Outside the allowed window");
    expect(detalhe?.eventos.map((evento) => evento.rotulo)).toContain("failed");
    expect(await obterMensagem(acesso((await empresa("Outra", "200000000004")).empresa.id, "nao-importa"), linha.id)).toBeNull();
  });

  it("recebe a resposta no número da empresa sem perder o opt-out e sem misturar empresas", async () => {
    const casa = await empresa("Casa Numero", "200000000005");
    const vizinha = await empresa("Vizinha Numero", "200000000006");
    await prisma.numeroTwilioEmpresa.create({
      data: {
        empresaId: casa.empresa.id,
        telefoneE164: "+5511988877001",
        canal: "WHATSAPP",
        status: "ATIVO",
        padrao: true,
      },
    });
    await prisma.numeroTwilioEmpresa.create({
      data: {
        empresaId: vizinha.empresa.id,
        telefoneE164: "+5511988877001",
        canal: "WHATSAPP",
        status: "ATIVO",
        padrao: true,
      },
    });
    const ambiguo = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: "SMambiguo000000000000000000001",
      From: "whatsapp:+5513988881003",
      To: "whatsapp:+5511988877001",
      Body: "Oi",
      SmsStatus: "received",
    };
    await processarWebhookTwilio({ assinatura: assinar(ambiguo), parametros: ambiguo });
    expect(await prisma.eventoWhatsapp.count({ where: { messageSid: ambiguo.MessageSid } })).toBe(0);

    await prisma.numeroTwilioEmpresa.deleteMany({ where: { empresaId: vizinha.empresa.id } });
    const oi = {
      ...ambiguo,
      MessageSid: "SMentrada00000000000000000001",
      Body: "Pode falar",
    };
    await processarWebhookTwilio({ assinatura: assinar(oi), parametros: oi });
    expect(await prisma.eventoWhatsapp.findFirst({ where: { messageSid: oi.MessageSid } })).toMatchObject({
      empresaId: casa.empresa.id,
      tipo: "INBOUND",
      corpo: "Pode falar",
    });
    expect(await prisma.mensagemAssessor.count()).toBe(0);

    const parar = { ...oi, MessageSid: "SMparar0000000000000000000001", Body: "PARAR" };
    await processarWebhookTwilio({ assinatura: assinar(parar), parametros: parar });
    expect(await prisma.optOutWhatsapp.findUnique({
      where: { empresaId_telefone: { empresaId: casa.empresa.id, telefone: "5513988881003" } },
    })).toMatchObject({ ativo: true });
    expect(await prisma.optOutWhatsapp.count({ where: { empresaId: vizinha.empresa.id } })).toBe(0);

    const status = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      MessageSid: "SMnumstatus000000000000000001",
      MessageStatus: "delivered",
      From: "whatsapp:+5511988877001",
      To: "whatsapp:+5513988881003",
    };
    const cliente = await pessoa(casa.empresa.id, "Cliente Numero", "13988881003", "300000000005");
    const cobranca = await fatura(casa.empresa.id, cliente.id, "Boleto");
    await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "ENVIADO",
      destino: "whatsapp:+5513988881003",
      messageSid: status.MessageSid,
    });
    await processarWebhookTwilio({ assinatura: assinar(status), parametros: status });
    expect(await prisma.filaWhatsapp.findFirst({ where: { messageSid: status.MessageSid } })).toMatchObject({
      motivo: "Twilio delivered",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mostra a conversa, zera o não lido ao abrir e só responde dentro da janela", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    const casa = await empresa("Casa Conversa", "200000000007");
    const cliente = await pessoa(casa.empresa.id, "Oficina Azul", "13988881004", "300000000007");
    const cobranca = await fatura(casa.empresa.id, cliente.id, "Revisão");
    await fila({
      empresaId: casa.empresa.id,
      faturaId: cobranca.id,
      clienteId: cliente.id,
      status: "ENVIADO",
      motivo: "Twilio delivered",
      destino: "whatsapp:+5513988881004",
      messageSid: "SMenvio0000000000000000000001",
      criadoEm: new Date("2026-11-11T12:00:00.000Z"),
    });
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId: casa.empresa.id,
        messageSid: "SMcliente00000000000000000001",
        tipo: "INBOUND",
        status: "RECEBIDA",
        de: "whatsapp:+5513988881004",
        para: REMETENTE_OFICIAL_WHATSAPP,
        corpo: "Recebi o boleto",
        recebidoEm: new Date("2026-11-11T14:00:00.000Z"),
      },
    });
    const autor = acesso(casa.empresa.id, casa.usuario.id);
    const antes = await listarConversas(autor);
    expect(antes[0]).toMatchObject({ nomes: "Oficina Azul", naoLidas: 1 });
    const aberta = await obterConversa(autor, "5513988881004", { agora: AGORA });
    expect(aberta?.janelaAberta).toBe(true);
    expect(aberta?.bolhas.map((bolha) => bolha.texto)).toEqual([
      "WhatsApp · vence em 3 dias (Padaria, R$ 150,00)",
      "Recebi o boleto",
    ]);
    expect((await listarConversas(autor))[0]?.naoLidas).toBe(0);

    const twilio = criarClienteTwilioMemoria();
    const enviada = await responderWhatsapp(
      autor,
      { telefone: "5513988881004", texto: "Pode pagar pelo link." },
      { twilio, agora: AGORA, env: process.env },
    );
    expect(twilio.textos).toHaveLength(1);
    expect(twilio.textos[0]).toMatchObject({
      para: "whatsapp:+5513988881004",
      de: REMETENTE_OFICIAL_WHATSAPP,
      corpo: "Pode pagar pelo link.",
    });
    expect(enviada.bolhas.at(-1)?.texto).toBe("Pode pagar pelo link.");
    expect(await prisma.respostaWhatsapp.count({ where: { empresaId: casa.empresa.id } })).toBe(1);

    await prisma.eventoWhatsapp.updateMany({
      where: { messageSid: "SMcliente00000000000000000001" },
      data: { recebidoEm: new Date("2026-11-09T14:00:00.000Z") },
    });
    const fora = criarClienteTwilioMemoria();
    await expect(
      responderWhatsapp(autor, { telefone: "5513988881004", texto: "Ainda dá?" }, { twilio: fora, agora: AGORA, env: process.env }),
    ).rejects.toThrow(TEXTO_FORA_DA_JANELA);
    expect(fora.textos).toHaveLength(0);

    await prisma.optOutWhatsapp.create({
      data: { empresaId: casa.empresa.id, telefone: "5513988881099", ativo: true, origem: "INBOUND" },
    });
    await prisma.eventoWhatsapp.create({
      data: {
        empresaId: casa.empresa.id,
        messageSid: "SMopt000000000000000000000001",
        tipo: "INBOUND",
        status: "PARAR",
        de: "whatsapp:+5513988881099",
        para: REMETENTE_OFICIAL_WHATSAPP,
        corpo: "PARAR",
        recebidoEm: AGORA,
      },
    });
    const bloqueado = criarClienteTwilioMemoria();
    await expect(
      responderWhatsapp(autor, { telefone: "5513988881099", texto: "Oi" }, { twilio: bloqueado, agora: AGORA, env: process.env }),
    ).rejects.toThrow(TEXTO_OPT_OUT);
    expect(bloqueado.textos).toHaveLength(0);

    const semEntrada = criarClienteTwilioMemoria();
    await expect(
      responderWhatsapp(autor, { telefone: "5513988881000", texto: "Oi" }, { twilio: semEntrada, agora: AGORA, env: process.env }),
    ).rejects.toThrow(TEXTO_SEM_ENTRADA);
    expect(semEntrada.textos).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
