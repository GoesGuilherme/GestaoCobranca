import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { completarCnpj } from "@/lib/documento";
import { assinaturaTwilio } from "@/lib/twilio-assinatura";
import { prisma } from "@/server/db";
import { criarFerramentasAtendimento } from "@/server/atendimento-ia/ferramentas";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import {
  executarAtendimentoIa,
  obterAtendimentoIa,
  salvarAtendimentoIa,
} from "./atendimento-ia-service";
import { criarCliente } from "./cliente-service";
import { obterConversa } from "./mensagens-service";
import { faturaIdsComPromessaAtiva } from "./promessa-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { processarWebhookTwilio } from "./twilio-webhook-service";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
delete process.env.TWILIO_MOCK;
delete process.env.AI_WHATSAPP_MODEL;

usarBancoDeTeste();

const AGORA = new Date("2026-11-18T15:00:00.000Z");
const PIX_A = "00020126580014br.gov.bcb.pix0114CHAVECLIENTEA5204000053039865802BR";
const PIX_B = "00020126580014br.gov.bcb.pix0114CHAVECLIENTEB5204000053039865802BR";
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

beforeAll(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

beforeEach(() => {
  fetchSpy.mockClear();
  delete process.env.AI_WHATSAPP_LIMITE_CONVERSA;
});

function sid() {
  return `SM${randomBytes(15).toString("hex")}`.slice(0, 34);
}

async function empresa(nome: string, cnpj: string) {
  return criarEmpresaDeTeste({ nomeFantasia: nome, cnpj: completarCnpj(cnpj) });
}

async function pessoa(empresaId: string, documento: string, whatsapp: string, nome: string) {
  return criarCliente(empresaId, {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp,
    email: `${documento}@exemplo.test`,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
  });
}

async function ligar(empresaId: string) {
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
}

async function ligarIa(empresaId: string, textoRepasse = "Fale com o financeiro no telefone da empresa.") {
  await prisma.configuracaoAtendimentoIa.create({
    data: { empresaId, ativo: true, instrucoes: "Seja breve.", textoRepasse },
  });
}

function trabalho(empresaId: string, telefone: string, corpo: string, messageSid = sid()) {
  return {
    empresaId,
    messageSid,
    de: `whatsapp:+55${telefone}`,
    para: "whatsapp:+5511988877665",
    corpo,
    recebidoEm: AGORA.toISOString(),
  };
}

async function fatura(
  empresaId: string,
  clienteId: string,
  valor: string,
  extra: {
    status?: string;
    provedor?: "ASAAS" | "CORA" | "PIX_DIRETO";
    boletoUrl?: string | null;
    faturaUrl?: string | null;
    pixCopiaCola?: string | null;
    vencimento?: Date;
  } = {},
) {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      provedor: extra.provedor ?? "ASAAS",
      valor,
      vencimento: extra.vencimento ?? new Date("2026-11-10T00:00:00.000Z"),
      status: extra.status ?? "OVERDUE",
      formaCobranca: extra.provedor === "PIX_DIRETO" ? "PIX" : "BOLETO",
      boletoUrl: extra.boletoUrl === undefined ? "https://cobranca.exemplo.test/boleto" : extra.boletoUrl,
      faturaUrl: extra.faturaUrl ?? null,
      pixCopiaCola: extra.pixCopiaCola ?? null,
      descricao: "Mensalidade",
    },
  });
}

describe("atendimento por IA no WhatsApp", () => {
  it("a migration só acrescenta tabelas e nasce desligada", () => {
    const sql = readFileSync("prisma/migrations/20261118180000_atendimento_ia_whatsapp/migration.sql", "utf8");
    expect(sql.toLowerCase().includes("drop ")).toBe(false);
    expect(sql).toContain("ativo\" BOOLEAN NOT NULL DEFAULT false");
    const ferramentas = readFileSync("src/server/atendimento-ia/ferramentas.ts", "utf8");
    const servico = readFileSync("src/server/services/atendimento-ia-service.ts", "utf8");
    expect(ferramentas.includes("$transaction")).toBe(false);
    expect(ferramentas.includes("fetch(")).toBe(false);
    expect(servico.includes("$transaction")).toBe(false);
  });

  it("as ferramentas só enxergam o cliente e a empresa desta conversa", async () => {
    const casa = await empresa("Padaria Norte", "701000000001");
    const outra = await empresa("Mercado Sul", "701000000002");
    const cliente = await pessoa(casa.id, completarCnpj("701000000011"), "11988880001", "Cliente Norte");
    const vizinho = await pessoa(casa.id, completarCnpj("701000000022"), "11988880001", "Cliente Vizinho");
    const externo = await pessoa(outra.id, completarCnpj("701000000033"), "11988880001", "Cliente Sul");
    const minha = await fatura(casa.id, cliente.id, "150.00", {
      provedor: "PIX_DIRETO",
      status: "EM_ABERTO",
      boletoUrl: null,
      faturaUrl: "https://cobranca.exemplo.test/cliente-a",
      pixCopiaCola: PIX_A,
    });
    const doVizinho = await fatura(casa.id, vizinho.id, "999.00", {
      provedor: "CORA",
      status: "LATE",
      boletoUrl: null,
      faturaUrl: "https://cobranca.exemplo.test/vizinho",
      pixCopiaCola: PIX_B,
    });
    await fatura(outra.id, externo.id, "777.00", {
      faturaUrl: "https://cobranca.exemplo.test/cliente-b",
      pixCopiaCola: PIX_B,
    });
    await prisma.conversaAtendimentoIa.create({
      data: { empresaId: casa.id, telefone: "5511988880001", clienteId: cliente.id },
    });
    const conversa = await prisma.conversaAtendimentoIa.findFirstOrThrow({ where: { empresaId: casa.id } });
    const ferramentas = criarFerramentasAtendimento({
      empresaId: casa.id,
      clienteId: cliente.id,
      conversaId: conversa.id,
      nomeEmpresa: "Padaria Norte",
      textoRepasse: "ramal 9",
      agora: AGORA,
    });

    const lista = await ferramentas.listarFaturas();
    expect(lista.texto).toContain("R$ 150,00");
    expect(lista.texto).toContain("10/11/2026");
    expect(lista.texto).toContain("em aberto");
    expect(lista.texto).not.toContain("999");
    expect(lista.texto).not.toContain("777");
    expect(lista.faturaId).toBe(minha.id);

    const via = await ferramentas.segundaVia(null);
    expect(via.texto).toContain("https://cobranca.exemplo.test/cliente-a");
    expect(via.texto).toContain(PIX_A);
    expect(via.texto).toContain("Pix copia e cola");
    expect(via.texto.toLowerCase()).not.toMatch(/asaas|cora|\binter\b|banco/);
    expect(via.texto).not.toContain("vizinho");
    expect(via.texto).not.toContain(PIX_B);

    const invasao = await ferramentas.segundaVia(doVizinho.id);
    expect(invasao.texto).toContain("Não encontrei");
    expect(invasao.texto).not.toContain("999");
    expect(invasao.texto).not.toContain(PIX_B);

    const alheia = await ferramentas.registrarPromessa(doVizinho.id, "2026-11-20");
    expect(alheia.texto).toContain("Não encontrei");
    expect(await prisma.promessaPagamento.count()).toBe(0);

    const longe = await ferramentas.registrarPromessa(minha.id, "2026-12-10");
    expect(longe.texto).toContain("prazo");
    expect(await prisma.promessaPagamento.count()).toBe(0);

    const anotada = await ferramentas.registrarPromessa(minha.id, "2026-11-20");
    expect(anotada.texto).toContain("R$ 150,00");
    expect(anotada.texto).toContain("20/11/2026");
    const gravada = await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: minha.id } });
    expect(gravada.origem).toBe("WHATSAPP");
    expect(gravada.canal).toBe("WHATSAPP");
    expect(gravada.valorPrometido.toFixed(2)).toBe("150.00");
    expect(gravada.empresaId).toBe(casa.id);
    expect(gravada.clienteId).toBe(cliente.id);
    expect(await faturaIdsComPromessaAtiva(casa.id, "2026-11-18")).toEqual(new Set([minha.id]));
    expect(await faturaIdsComPromessaAtiva(outra.id, "2026-11-18")).toEqual(new Set());

    const humano = await ferramentas.transferir("PEDIDO");
    expect(humano.texto).toContain("ramal 9");
    const pausa = await prisma.conversaAtendimentoIa.findFirstOrThrow({ where: { id: conversa.id } });
    expect(pausa.precisaAtencao).toBe(true);
    expect(pausa.pausadaAte?.toISOString()).toBe(new Date(AGORA.getTime() + 24 * 60 * 60 * 1000).toISOString());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("responde só o cliente do telefone, avisa que é assistente e não repete no mesmo sid", async () => {
    const casa = await empresa("Padaria Norte", "702000000001");
    const outra = await empresa("Mercado Sul", "702000000002");
    await ligar(casa.id);
    await ligarIa(casa.id);
    const cliente = await pessoa(casa.id, completarCnpj("702000000011"), "11988880011", "Padaria");
    const externo = await pessoa(outra.id, completarCnpj("702000000022"), "11988880011", "Mercado");
    await prisma.filial.create({
      data: {
        clienteId: cliente.id,
        nome: "Quiosque",
        cnpj: completarCnpj("702000000033"),
        endereco: "Rua 1",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVA",
        whatsapp: "11977770022",
      },
    });
    await fatura(casa.id, cliente.id, "150.00", { faturaUrl: "https://cobranca.exemplo.test/cliente-a" });
    await fatura(outra.id, externo.id, "777.00", { faturaUrl: "https://cobranca.exemplo.test/cliente-b" });
    const twilio = criarClienteTwilioMemoria();
    const primeiro = await executarAtendimentoIa(trabalho(casa.id, "11977770022", "quais faturas em aberto"), {
      agora: AGORA,
      twilio,
    });
    expect(primeiro.situacao).toBe("enviado");
    expect(twilio.textos[0]?.corpo.startsWith("Sou um assistente virtual da Padaria Norte.")).toBe(true);
    expect(twilio.textos[0]?.corpo).toContain("R$ 150,00");
    expect(twilio.textos[0]?.corpo).not.toContain("777");
    expect(twilio.textos[0]?.corpo).not.toContain("cliente-b");
    const deNovo = await executarAtendimentoIa(
      { ...trabalho(casa.id, "11977770022", "quais faturas em aberto"), messageSid: (await prisma.entradaAtendimentoIa.findFirstOrThrow()).messageSid },
      { agora: AGORA, twilio },
    );
    expect(deNovo.situacao).toBe("duplicado");
    expect(twilio.textos).toHaveLength(1);

    const segundo = await executarAtendimentoIa(trabalho(casa.id, "11977770022", "pode mandar o link"), {
      agora: new Date(AGORA.getTime() + 1000),
      twilio,
    });
    expect(segundo.situacao).toBe("enviado");
    expect(twilio.textos[1]?.corpo.includes("assistente virtual")).toBe(false);
    expect(twilio.textos[1]?.corpo).toContain("https://cobranca.exemplo.test/cliente-a");
    const resposta = await prisma.respostaWhatsapp.findFirstOrThrow({ where: { empresaId: casa.id, origem: "IA" } });
    const dono = {
      usuarioId: "usuario-teste",
      nome: "Dono",
      email: "dono@exemplo.test",
      empresaId: casa.id,
      nomeEmpresa: "Padaria Norte",
      cnpjEmpresa: "00000000000000",
      papel: "DONO" as const,
      superadministrador: false,
    };
    const conversa = await obterConversa(dono, "5511977770022", { agora: AGORA, marcarLida: false });
    expect(conversa?.bolhas.some((bolha) => bolha.origem === "IA" && bolha.detalhe === "IA" && bolha.texto.includes("R$ 150,00"))).toBe(true);
    expect(resposta.origem).toBe("IA");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem cadastro ou com dois cadastros entrega o contato e para a IA, sem valor", async () => {
    const casa = await empresa("Padaria Norte", "703000000001");
    await ligar(casa.id);
    await ligarIa(casa.id, "WhatsApp do financeiro: (13) 98888-0000");
    const twilio = criarClienteTwilioMemoria();
    const provedor = {
      async gerar() {
        throw new Error("nao devia chamar o modelo");
      },
    };
    const sem = await executarAtendimentoIa(trabalho(casa.id, "11966660001", "oi, quero pagar"), {
      agora: AGORA,
      twilio,
      provedor,
    });
    expect(sem.situacao).toBe("sem_cliente");
    expect(twilio.textos[0]?.corpo).toContain("assistente virtual");
    expect(twilio.textos[0]?.corpo).toContain("(13) 98888-0000");
    expect(twilio.textos[0]?.corpo).not.toMatch(/R\$/);
    const pausa = await prisma.conversaAtendimentoIa.findFirstOrThrow({ where: { empresaId: casa.id } });
    expect(pausa.precisaAtencao).toBe(true);
    expect(pausa.pausadaAte).not.toBeNull();

    await pessoa(casa.id, completarCnpj("703000000011"), "11966660002", "Um");
    await pessoa(casa.id, completarCnpj("703000000022"), "11966660002", "Dois");
    await fatura(casa.id, (await prisma.cliente.findFirstOrThrow({ where: { nomeFantasia: "Um" } })).id, "150.00");
    await fatura(casa.id, (await prisma.cliente.findFirstOrThrow({ where: { nomeFantasia: "Dois" } })).id, "999.00");
    const ambiguo = await executarAtendimentoIa(trabalho(casa.id, "11966660002", "minhas faturas"), {
      agora: AGORA,
      twilio,
      provedor,
    });
    expect(ambiguo.situacao).toBe("ambiguo");
    expect(twilio.textos.at(-1)?.corpo).not.toContain("150");
    expect(twilio.textos.at(-1)?.corpo).not.toContain("999");

    const desconto = await executarAtendimentoIa(trabalho(casa.id, "11966660009", "quero 50% de desconto"), {
      agora: AGORA,
      twilio,
    });
    expect(desconto.situacao).toBe("sem_cliente");
    expect(await prisma.promessaPagamento.count()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("respeita pausa, limite e o botão de promessa antes da IA", async () => {
    const casa = await empresa("Padaria Norte", "704000000001");
    await ligar(casa.id);
    await ligarIa(casa.id);
    await prisma.configuracaoAssessor.create({
      data: {
        empresaId: casa.id,
        ativo: true,
        modoTeste: false,
        nome: "Lia",
        tom: "breve",
        horaInicio: 8,
        horaFim: 18,
      },
    });
    const cliente = await pessoa(casa.id, completarCnpj("704000000011"), "11988880041", "Cliente");
    const aberta = await fatura(casa.id, cliente.id, "150.00");
    const twilio = criarClienteTwilioMemoria();
    await executarAtendimentoIa(trabalho(casa.id, "11988880041", "quero 50% de desconto"), { agora: AGORA, twilio });
    expect(twilio.textos[0]?.corpo).toContain("uma pessoa");
    expect(twilio.textos[0]?.corpo).not.toMatch(/R\$/);
    expect(await prisma.promessaPagamento.count()).toBe(0);
    const parado = await executarAtendimentoIa(trabalho(casa.id, "11988880041", "quais faturas"), {
      agora: new Date(AGORA.getTime() + 60_000),
      twilio,
    });
    expect(parado.situacao).toBe("pausado");
    expect(twilio.textos).toHaveLength(1);

    const limiteTwilio = criarClienteTwilioMemoria();
    const env = { ...process.env, AI_WHATSAPP_LIMITE_CONVERSA: "1" };
    await prisma.respostaWhatsapp.deleteMany({ where: { empresaId: casa.id } });
    await prisma.conversaAtendimentoIa.updateMany({
      where: { empresaId: casa.id },
      data: { pausadaAte: new Date(AGORA.getTime() - 1000), precisaAtencao: false },
    });
    const dentro = await executarAtendimentoIa(trabalho(casa.id, "11988880041", "link do pagamento"), {
      agora: AGORA,
      twilio: limiteTwilio,
      env,
    });
    expect(dentro.situacao).toBe("enviado");
    const estouro = await executarAtendimentoIa(trabalho(casa.id, "11988880041", "de novo o link"), {
      agora: new Date(AGORA.getTime() + 1000),
      twilio: limiteTwilio,
      env,
    });
    expect(estouro.situacao).toBe("limite");
    expect(limiteTwilio.textos).toHaveLength(1);

    await prisma.conversaPromessaWhatsapp.create({
      data: {
        empresaId: casa.id,
        faturaId: aberta.id,
        clienteId: cliente.id,
        telefone: "5511988880041",
        etapa: "DATA",
        expiraEm: new Date(AGORA.getTime() + 60 * 60 * 1000),
      },
    });
    const linha = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId: casa.id } });
    const parametros = {
      AccountSid: linha.subaccountSid,
      MessageSid: sid(),
      From: "whatsapp:+5511988880041",
      To: "whatsapp:+5511988877665",
      Body: "Amanhã",
      SmsStatus: "received",
    };
    const fila: string[] = [];
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(linha.webhookUrl, parametros, "token-subconta-teste-0001"),
      parametros,
      twilio,
      agora: AGORA,
      agendarAtendimentoIa: () => fila.push("ia"),
    });
    expect(fila).toEqual([]);
    expect(await prisma.promessaPagamento.count({ where: { faturaId: aberta.id, origem: "WHATSAPP" } })).toBe(1);
    const respostasIa = await prisma.respostaWhatsapp.count({ where: { empresaId: casa.id, origem: "IA" } });
    expect(await prisma.mensagemAssessor.count({ where: { empresaId: casa.id } })).toBe(0);

    const livre = {
      AccountSid: linha.subaccountSid,
      MessageSid: sid(),
      From: "whatsapp:+5511988880041",
      To: "whatsapp:+5511988877665",
      Body: "quais faturas em aberto",
      SmsStatus: "received",
    };
    const agendados: { messageSid: string }[] = [];
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(linha.webhookUrl, livre, "token-subconta-teste-0001"),
      parametros: livre,
      twilio,
      agora: new Date("2026-11-19T15:00:00.000Z"),
      agendarAtendimentoIa: (item) => agendados.push(item),
    });
    expect(agendados).toHaveLength(1);
    expect(await prisma.mensagemAssessor.count({ where: { empresaId: casa.id } })).toBe(0);
    expect(await prisma.respostaWhatsapp.count({ where: { empresaId: casa.id, origem: "IA" } })).toBe(respostasIa);
    const botao = {
      ...livre,
      MessageSid: sid(),
      Body: "Registrar promessa",
      ButtonPayload: "pp1_botao",
    };
    const botoes: unknown[] = [];
    await processarWebhookTwilio({
      assinatura: assinaturaTwilio(linha.webhookUrl, botao, "token-subconta-teste-0001"),
      parametros: botao,
      twilio,
      agora: AGORA,
      agendarAtendimentoIa: (item) => botoes.push(item),
    });
    expect(botoes).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("só o dono grava a configuração, e ela nasce desligada", async () => {
    const casa = await empresa("Padaria Norte", "705000000001");
    expect(await obterAtendimentoIa(casa.id)).toEqual({ ativo: false, instrucoes: "", textoRepasse: "" });
    const base = {
      usuarioId: "usuario-teste",
      nome: "Dono",
      email: "dono@exemplo.test",
      empresaId: casa.id,
      nomeEmpresa: "Padaria Norte",
      cnpjEmpresa: "00000000000000",
      papel: "DONO" as const,
      superadministrador: false,
    };
    await expect(
      salvarAtendimentoIa({ ...base, papel: "FINANCEIRO" }, { ativo: true, instrucoes: "", textoRepasse: "" }),
    ).rejects.toMatchObject({ status: 403 });
    const salva = await salvarAtendimentoIa(base, {
      ativo: true,
      instrucoes: "Tom calmo.",
      textoRepasse: "ramal 9",
    });
    expect(salva).toEqual({ ativo: true, instrucoes: "Tom calmo.", textoRepasse: "ramal 9" });
    expect(await obterAtendimentoIa(casa.id)).toEqual(salva);
  });
});
