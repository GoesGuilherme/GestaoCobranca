import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEXTO_FALLBACK, TEXTO_LIMITE, TEXTO_TETO } from "@/lib/assessor-mensagens";
import { cifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { completarCnpj, completarCpf } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { criarProvedorAssessorMemoria } from "@/server/assessor/memoria";
import type { ProvedorAssessor } from "@/server/assessor/provedor";
import { criarFerramentasAssessor } from "@/server/assessor/ferramentas";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import {
  assumirConversa,
  devolverConversa,
  obterConversa,
  processarEntradaAssessor,
  responderConversa,
  salvarAssessor,
} from "./assessor-service";
import { criarCliente } from "./cliente-service";
import { criarFilial } from "./filial-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { processarWebhookTwilio } from "./twilio-webhook-service";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
delete process.env.TWILIO_MOCK;

usarBancoDeTeste();

const AGORA = new Date("2026-10-30T15:00:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

beforeAll(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(() => {
  fetchSpy.mockClear();
  delete process.env.ASSESSOR_LIMITE_TELEFONE;
  delete process.env.ASSESSOR_LIMITE_EMPRESA;
  delete process.env.ASSESSOR_TETO_TOKENS_DIA;
  delete process.env.ASSESSOR_TIMEOUT_MS;
});

function sid() {
  return `SM${randomBytes(15).toString("hex")}`.slice(0, 34);
}

async function empresa(nome: string, cnpj: string) {
  return criarEmpresaDeTeste({ nomeFantasia: nome, cnpj: completarCnpj(cnpj) });
}

async function ligar(empresaId: string, modoTeste = false) {
  await prisma.configuracaoTwilio.create({
    data: {
      empresaId,
      subaccountSid: `AC${randomBytes(16).toString("hex")}`,
      authTokenCifrado: cifrarSegredoAsaas("token-subconta-teste-0001"),
      authTokenUltimos4: "0001",
      senderSid: `XE${randomBytes(16).toString("hex")}`,
      senderTelefone: "+5511988877665",
      senderStatus: "ONLINE",
      nomeExibicao: "Empresa",
      webhookUrl: "https://taguaro.test/api/webhooks/twilio",
    },
  });
  await prisma.configuracaoAssessor.create({
    data: {
      empresaId,
      ativo: true,
      modoTeste,
      nome: "Lia",
      tom: "breve",
      horaInicio: 8,
      horaFim: 18,
      atendeFimDeSemana: false,
    },
  });
}

async function pessoa(empresaId: string, documento: string, whatsapp: string, nome: string) {
  return criarCliente(empresaId, {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp,
    email: `${whatsapp}@exemplo.test`,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
  });
}

async function fatura(empresaId: string, clienteId: string, valor: string, status: string, link: string) {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor,
      vencimento: new Date("2026-10-20T00:00:00.000Z"),
      status,
      formaCobranca: "BOLETO",
      boletoUrl: link,
      faturaUrl: link,
      descricao: "Mensalidade",
    },
  });
}

function provedorContado() {
  let chamadas = 0;
  const base = criarProvedorAssessorMemoria();
  const provedor: ProvedorAssessor = {
    async gerar(entrada) {
      chamadas += 1;
      return base.gerar(entrada);
    },
  };
  return { provedor, vezes: () => chamadas };
}

async function falar(
  empresaId: string,
  telefone: string,
  corpo: string,
  extra: {
    sid?: string;
    recebidoEm?: Date;
    agora?: Date;
    provedor?: ProvedorAssessor;
    twilio?: ReturnType<typeof criarClienteTwilioMemoria>;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const twilio = extra.twilio ?? criarClienteTwilioMemoria();
  const resultado = await processarEntradaAssessor(
    {
      empresaId,
      messageSid: extra.sid ?? sid(),
      de: `whatsapp:+55${telefone}`,
      corpo,
      recebidoEm: extra.recebidoEm,
    },
    { agora: extra.agora ?? AGORA, twilio, provedor: extra.provedor, env: extra.env },
  );
  const respostas = await prisma.mensagemAssessor.findMany({
    where: { empresaId, papel: { in: ["ASSESSOR", "HUMANO"] } },
    orderBy: { criadoEm: "asc" },
  });
  return { resultado, twilio, respostas };
}

describe("assessor de WhatsApp", () => {
  it("não remove o índice parcial da fatura em criação", () => {
    const nova = readFileSync("prisma/migrations/20261030180000_assessor_whatsapp/migration.sql", "utf8").toLowerCase();
    expect(nova.includes("drop index")).toBe(false);
    expect(nova.includes("drop table")).toBe(false);
    const antiga = readFileSync("prisma/migrations/20261029180000_fatura_criando/migration.sql", "utf8");
    expect(antiga.includes("faturas_criando_por_cliente")).toBe(true);
  });

  it("isola faturas e conversas entre empresas", async () => {
    const a = await empresa("Empresa A", "601000000001");
    const b = await empresa("Empresa B", "601000000002");
    await ligar(a.id);
    await ligar(b.id);
    const clienteA = await pessoa(a.id, completarCnpj("601000000011"), "11988880001", "Cliente A");
    const clienteB = await pessoa(b.id, completarCnpj("601000000022"), "11988880001", "Cliente B");
    await fatura(a.id, clienteA.id, "150.00", "OVERDUE", "https://www.asaas.com/i/empresa-a");
    await fatura(b.id, clienteB.id, "999.00", "OVERDUE", "https://www.asaas.com/i/empresa-b");
    const antes = await prisma.fatura.count();

    const respostaA = await falar(a.id, "11988880001", "quero o link do boleto");
    const textoA = respostaA.respostas.map((item) => item.corpo).join("\n");
    expect(textoA).toContain("https://www.asaas.com/i/empresa-a");
    expect(textoA).toContain("R$ 150,00");
    expect(textoA).not.toContain("999");
    expect(textoA).not.toContain("empresa-b");
    expect(respostaA.twilio.textos[0]?.para).toBe("whatsapp:+5511988880001");
    expect(await prisma.fatura.count()).toBe(antes);

    const respostaB = await falar(b.id, "11988880001", "quais faturas em aberto");
    const textoB = respostaB.respostas.map((item) => item.corpo).join("\n");
    expect(textoB).toContain("R$ 999,00");
    expect(textoB).not.toContain("150,00");
    expect(textoB).not.toContain("empresa-a");

    const conversaA = await prisma.conversaAssessor.findFirstOrThrow({ where: { empresaId: a.id } });
    await expect(obterConversa({ empresaId: b.id, papel: "DONO" }, conversaA.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      prisma.conversaAssessor.update({ where: { id: conversaA.id }, data: { clienteId: clienteB.id } }),
    ).rejects.toThrow(/cliente_outra_empresa/);

    const ferramentas = criarFerramentasAssessor({
      empresaId: a.id,
      clienteId: clienteB.id,
      nomeEmpresa: "Empresa A",
      conversaId: conversaA.id,
    });
    const lista = await ferramentas.listarFaturas();
    expect(lista.texto).not.toContain("999");
    expect(lista.texto).not.toContain("empresa-b");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reconhece o telefone do cliente ou da filial e só mostra dado depois do documento", async () => {
    const casa = await empresa("Empresa Casa", "602000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("602000000011"), "11988880011", "Padaria Exemplo");
    await criarFilial(casa.id, cliente.id, {
      nome: "Quiosque",
      cnpj: completarCnpj("602000000033"),
      endereco: "Rua Exemplo, 10",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVA",
      whatsapp: "11977770022",
    });
    await fatura(casa.id, cliente.id, "150.00", "PENDING", "https://www.asaas.com/i/padaria");
    const contador = provedorContado();

    const desconhecido = await falar(casa.id, "11966660033", "quero o link do boleto", { provedor: contador.provedor });
    expect(desconhecido.respostas.at(-1)?.corpo).toContain("CNPJ ou o CPF");
    expect(desconhecido.respostas.at(-1)?.corpo).not.toContain("150");
    expect(desconhecido.respostas.at(-1)?.corpo).not.toContain("asaas.com");
    expect(contador.vezes()).toBe(0);

    const errado = await falar(casa.id, "11966660033", completarCnpj("602000000099"), { provedor: contador.provedor });
    expect(errado.respostas.at(-1)?.corpo).toContain("Não encontrei esse documento");
    expect(errado.respostas.map((item) => item.corpo).join("\n")).not.toContain("asaas.com");

    const documento = await falar(casa.id, "11966660033", `meu cnpj ${completarCnpj("602000000011")}`, {
      provedor: contador.provedor,
    });
    expect(documento.respostas.at(-1)?.corpo).toContain("Padaria Exemplo");
    expect(documento.respostas.at(-1)?.corpo).not.toContain("https://");
    expect(contador.vezes()).toBe(0);

    const boleto = await falar(casa.id, "11966660033", "manda o link do boleto", { provedor: contador.provedor });
    expect(boleto.respostas.at(-1)?.corpo).toContain("https://www.asaas.com/i/padaria");
    expect(contador.vezes()).toBe(1);

    const filial = await falar(casa.id, "11977770022", "minha fatura foi paga?");
    expect(filial.respostas.at(-1)?.corpo).toContain("ainda não está paga");
    expect(filial.respostas.at(-1)?.corpo).toContain("R$ 150,00");

    const outra = await empresa("Empresa Outra", "602000000002");
    await ligar(outra.id);
    const alheio = await falar(outra.id, "11955550044", completarCnpj("602000000011"));
    expect(alheio.respostas.at(-1)?.corpo).toContain("Não encontrei esse documento");
    expect(alheio.respostas.at(-1)?.corpo).not.toContain("Padaria");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recusa assunto fora de cobrança sem consultar fatura", async () => {
    const casa = await empresa("Empresa Escopo", "603000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCpf("529982247"), "11988880021", "Cliente Escopo");
    await fatura(casa.id, cliente.id, "150.00", "PENDING", "https://www.asaas.com/i/escopo");
    const contador = provedorContado();
    const resposta = await falar(casa.id, "11988880021", "qual a capital da França? me conta uma piada", {
      provedor: contador.provedor,
    });
    expect(contador.vezes()).toBe(0);
    expect(resposta.respostas.at(-1)?.corpo).toContain("só posso ajudar");
    expect(resposta.respostas.at(-1)?.corpo).not.toContain("150");
    expect(resposta.respostas.at(-1)?.corpo).not.toContain("asaas.com");
  });

  it("não envia texto livre fora da janela de 24 horas", async () => {
    const casa = await empresa("Empresa Janela", "604000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("604000000011"), "11988880031", "Cliente Janela");
    await fatura(casa.id, cliente.id, "150.00", "OVERDUE", "https://www.asaas.com/i/janela");
    const resposta = await falar(casa.id, "11988880031", "quero o boleto", {
      recebidoEm: new Date("2026-10-29T14:00:00.000Z"),
    });
    expect(resposta.resultado.situacao).toBe("janela");
    expect(resposta.twilio.textos).toHaveLength(0);
    expect(resposta.respostas).toHaveLength(0);
    const conversa = await prisma.conversaAssessor.findFirstOrThrow({ where: { empresaId: casa.id } });
    await expect(
      responderConversa({ empresaId: casa.id, papel: "DONO" }, conversa.id, { texto: "Olá de novo" }, { agora: AGORA, twilio: resposta.twilio }),
    ).rejects.toBeInstanceOf(ErroAplicacao);
    expect(resposta.twilio.textos).toHaveLength(0);
  });

  it("respeita o opt-out e não responde", async () => {
    const casa = await empresa("Empresa Opt", "605000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("605000000011"), "11988880041", "Cliente Opt");
    await fatura(casa.id, cliente.id, "150.00", "PENDING", "https://www.asaas.com/i/opt");
    await prisma.optOutWhatsapp.create({
      data: { empresaId: casa.id, telefone: "5511988880041", ativo: true, origem: "INBOUND" },
    });
    const resposta = await falar(casa.id, "11988880041", "quero o link do boleto");
    expect(resposta.resultado.situacao).toBe("opt_out");
    expect(resposta.twilio.textos).toHaveLength(0);
    expect(resposta.respostas).toHaveLength(0);
  });

  it("trata o mesmo MessageSid uma vez só", async () => {
    const casa = await empresa("Empresa Sid", "606000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("606000000011"), "11988880051", "Cliente Sid");
    await fatura(casa.id, cliente.id, "150.00", "PENDING", "https://www.asaas.com/i/sid");
    const twilio = criarClienteTwilioMemoria();
    const messageSid = sid();
    const primeiro = await falar(casa.id, "11988880051", "quero o boleto", { sid: messageSid, twilio });
    const segundo = await falar(casa.id, "11988880051", "quero o boleto", { sid: messageSid, twilio });
    expect(primeiro.resultado.situacao).toBe("respondido");
    expect(segundo.resultado.situacao).toBe("duplicado");
    expect(twilio.textos).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("encaminha assunto técnico e pedido humano e pausa a IA", async () => {
    const casa = await empresa("Empresa Humano", "607000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("607000000011"), "11988880061", "Cliente Humano");
    await fatura(casa.id, cliente.id, "150.00", "PENDING", "https://www.asaas.com/i/humano");
    const contador = provedorContado();
    const tecnico = await falar(casa.id, "11988880061", "o aplicativo não abre e a senha não entra", {
      provedor: contador.provedor,
    });
    expect(contador.vezes()).toBe(0);
    expect(tecnico.respostas.at(-1)?.corpo).toContain("atendimento humano");
    expect(tecnico.respostas.at(-1)?.corpo).not.toContain("asaas.com");
    const pedido = await prisma.pedidoAtendimento.findFirstOrThrow({ where: { empresaId: casa.id } });
    expect(pedido.motivo).toBe("TECNICO");
    expect(pedido.clienteId).toBe(cliente.id);
    const conversa = await prisma.conversaAssessor.findFirstOrThrow({ where: { empresaId: casa.id } });
    expect(conversa.iaPausada).toBe(true);

    const depois = await falar(casa.id, "11988880061", "então manda o boleto", { provedor: contador.provedor });
    expect(depois.resultado.situacao).toBe("pausada");
    expect(depois.twilio.textos).toHaveLength(0);
    expect(contador.vezes()).toBe(0);

    const assumida = await assumirConversa({ empresaId: casa.id, papel: "FINANCEIRO" }, conversa.id);
    expect(assumida.iaPausada).toBe(true);
    expect(assumida.pedidos[0]?.status).toBe("ASSUMIDO");
    const devolvida = await devolverConversa({ empresaId: casa.id, papel: "DONO" }, conversa.id);
    expect(devolvida.iaPausada).toBe(false);
    await expect(salvarAssessor({ empresaId: casa.id, papel: "SUPORTE" }, { ativo: false })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("no modo teste só responde para TWILIO_WHATSAPP_TESTE", async () => {
    const casa = await empresa("Empresa Teste", "608000000001");
    await ligar(casa.id, true);
    await pessoa(casa.id, completarCnpj("608000000011"), "11988880071", "Cliente Real");
    const bloqueado = await falar(casa.id, "11988880071", "quero o boleto");
    expect(bloqueado.resultado.situacao).toBe("modo_teste");
    expect(bloqueado.twilio.textos).toHaveLength(0);

    const liberado = await falar(casa.id, "11999990000", "oi");
    expect(liberado.twilio.textos).toHaveLength(1);
    expect(liberado.twilio.textos[0]?.para).toBe("whatsapp:+5511999990000");
    expect(liberado.twilio.chamouRede).toBe(false);
  });

  it("aplica rate limit, teto de tokens e fallback de timeout", async () => {
    const casa = await empresa("Empresa Limite", "609000000001");
    await ligar(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("609000000011"), "11988880081", "Cliente Limite");
    await fatura(casa.id, cliente.id, "80.00", "OVERDUE", "https://www.asaas.com/i/limite");
    const contador = provedorContado();
    const env = { ...process.env, ASSESSOR_LIMITE_TELEFONE: "1", ASSESSOR_LIMITE_EMPRESA: "10" };
    await falar(casa.id, "11988880081", "quais faturas em aberto", { provedor: contador.provedor, env });
    const limitado = await falar(casa.id, "11988880081", "quero o boleto", { provedor: contador.provedor, env });
    expect(contador.vezes()).toBe(1);
    expect(limitado.respostas.at(-1)?.corpo).toBe(TEXTO_LIMITE);

    const casaEmpresa = await empresa("Empresa Cota", "609000000009");
    await ligar(casaEmpresa.id);
    await pessoa(casaEmpresa.id, completarCnpj("609000000091"), "11988880091", "Cliente Um");
    await pessoa(casaEmpresa.id, completarCnpj("609000000092"), "11988880092", "Cliente Dois");
    const cota = provedorContado();
    const envEmpresa = { ...process.env, ASSESSOR_LIMITE_TELEFONE: "5", ASSESSOR_LIMITE_EMPRESA: "1" };
    await falar(casaEmpresa.id, "11988880091", "oi", { provedor: cota.provedor, env: envEmpresa });
    const segundoTelefone = await falar(casaEmpresa.id, "11988880092", "oi", { provedor: cota.provedor, env: envEmpresa });
    expect(cota.vezes()).toBe(0);
    expect(segundoTelefone.respostas.at(-1)?.corpo).toBe(TEXTO_LIMITE);

    const outra = await empresa("Empresa Teto", "609000000002");
    await ligar(outra.id);
    const clienteTeto = await pessoa(outra.id, completarCnpj("609000000022"), "11988880082", "Cliente Teto");
    await fatura(outra.id, clienteTeto.id, "80.00", "PENDING", "https://www.asaas.com/i/teto");
    const lento: ProvedorAssessor = {
      async gerar() {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { texto: "não deveria sair", tokens: 10 };
      },
    };
    const timeout = await falar(outra.id, "11988880082", "quero o boleto", {
      provedor: lento,
      env: { ...process.env, ASSESSOR_TIMEOUT_MS: "20" },
    });
    expect(timeout.respostas.at(-1)?.corpo).toBe(TEXTO_FALLBACK);

    const casaDia = await empresa("Empresa Dia", "609000000003");
    await ligar(casaDia.id);
    const clienteDia = await pessoa(casaDia.id, completarCnpj("609000000033"), "11988880083", "Cliente Dia");
    await fatura(casaDia.id, clienteDia.id, "80.00", "PENDING", "https://www.asaas.com/i/dia");
    let chamadas = 0;
    const caro: ProvedorAssessor = {
      async gerar(entrada) {
        chamadas += 1;
        const base = await criarProvedorAssessorMemoria().gerar(entrada);
        return { ...base, tokens: 50 };
      },
    };
    const envDia = { ...process.env, ASSESSOR_TETO_TOKENS_DIA: "40" };
    await falar(casaDia.id, "11988880083", "quais faturas em aberto", { provedor: caro, env: envDia });
    const gravadas = await prisma.mensagemAssessor.findMany({ where: { empresaId: casaDia.id } });
    const teto = await falar(casaDia.id, "11988880083", "quero o boleto", { provedor: caro, env: envDia });
    expect(gravadas.map((item) => item.tokens)).toContain(50);
    expect(chamadas).toBe(1);
    expect(teto.respostas.at(-1)?.corpo).toBe(TEXTO_TETO);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("entra pelo webhook assinado e não responde de novo no mesmo sid", async () => {
    const casa = await empresa("Empresa Hook", "610000000001");
    await ligar(casa.id, true);
    await pessoa(casa.id, completarCnpj("610000000011"), "11999990000", "Numero Teste");
    const linha = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId: casa.id } });
    const token = "token-subconta-teste-0001";
    const parametros = {
      AccountSid: linha.subaccountSid,
      MessageSid: "SMwebhookassessor000000000001",
      From: "whatsapp:+5511999990000",
      To: `whatsapp:${linha.senderTelefone}`,
      Body: "oi",
      SmsStatus: "received",
    };
    const assinatura = assinaturaTwilio(linha.webhookUrl, parametros, token);
    const primeiro = await processarWebhookTwilio({ assinatura, parametros });
    const segundo = await processarWebhookTwilio({ assinatura, parametros });
    expect(primeiro.duplicado).toBe(false);
    expect(segundo.duplicado).toBe(true);
    const saidas = await prisma.mensagemAssessor.count({ where: { empresaId: casa.id, papel: "ASSESSOR" } });
    expect(saidas).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
