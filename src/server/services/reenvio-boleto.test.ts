import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/faturas/reenviar-boletos/route";
import { middleware } from "@/middleware";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { criarCliente } from "./cliente-service";
import { reenviarBoletos } from "./reenvio-boleto-service";
import { atribuirReguaCliente, atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.TWILIO_MOCK;
delete process.env.ASAAS_MOCK;

const cookieJar = vi.hoisted(() => ({ valor: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieJar.valor ? { value: cookieJar.valor } : undefined),
  }),
}));

usarBancoDeTeste();

const CHAVE = "re_teste_local_nao_enviar_0001";
const SID = `HX${"b".repeat(32)}`;
const AGORA = new Date("2026-11-09T15:00:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

let empresaId = "";
let outraEmpresaId = "";
let donoId = "";
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
    "TWILIO_WHATSAPP_OFICIAL_DESDE",
    "TWILIO_MOCK",
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
  process.env.TWILIO_ACCOUNT_SID = `AC${"b".repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
  process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = SID;
  delete process.env.TWILIO_WHATSAPP_SENDER_OFICIAL;
  delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
  delete process.env.TWILIO_MOCK;
}

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  vi.stubGlobal("fetch", fetchSpy);
  guardarAmbiente();
});

afterEach(() => {
  cookieJar.valor = undefined;
  restaurarAmbiente();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  fetchSpy.mockClear();
  ligarSandbox();
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Reenvio", cnpj: completarCnpj("591000000001") })).id;
  outraEmpresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra Reenvio", cnpj: completarCnpj("591000000002") })).id;
  donoId = (
    await prisma.usuario.create({
      data: {
        nome: "Dono Reenvio",
        email: `dono-${empresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId,
        papel: "DONO",
      },
    })
  ).id;
});

function autor(papel: PapelUsuario = "FINANCEIRO", id = empresaId) {
  return {
    empresaId: id,
    papel,
    email: papel === "DONO" ? `dono-${id}@exemplo.test` : `pessoa-${papel.toLowerCase()}@exemplo.test`,
    nomeEmpresa: "Empresa Reenvio",
  };
}

function pessoa(documento: string, email = "cliente.reenvio@exemplo.test", nome = "Cliente do Reenvio") {
  return {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
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
  return salvarConfiguracaoRegua(autor("DONO"), {
    ativa: true,
    modoTeste: true,
    remetenteNome: "Empresa Reenvio",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "",
    chaveResend: CHAVE,
    ...extra,
  });
}

async function passoEmissao(enviarWhatsapp = true) {
  const painel = await obterPainelRegua(autor("DONO"));
  const regua = painel.reguas[0];
  await atualizarRegua(autor("DONO"), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: [
      {
        id: regua.passos.find((passo) => passo.naEmissao)?.id,
        naEmissao: true,
        dias: null,
        canal: "EMAIL",
        assunto: "Boleto emitido",
        corpo: "Olá, {cliente}. Link {link}",
        enviarWhatsapp,
      },
    ],
  });
}

async function abrirFatura(
  clienteId: string,
  extra: {
    empresaId?: string;
    status?: string;
    formaCobranca?: string;
    boletoUrl?: string | null;
    excluida?: boolean;
    criadoEm?: Date;
    provedor?: "ASAAS" | "INTER";
  } = {},
) {
  return prisma.fatura.create({
    data: {
      empresaId: extra.empresaId ?? empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date("2026-11-20T00:00:00.000Z"),
      status: extra.status ?? "PENDING",
      provedor: extra.provedor ?? "ASAAS",
      formaCobranca: extra.formaCobranca ?? "BOLETO",
      boletoUrl: extra.boletoUrl === undefined ? "https://exemplo.test/boleto-reenvio" : extra.boletoUrl,
      excluida: extra.excluida ?? false,
      descricao: "Serviço exemplo",
      ...(extra.criadoEm ? { criadoEm: extra.criadoEm } : {}),
    },
  });
}

function clientesDeMemoria() {
  return { caixa: clienteResendMemoria(), twilio: criarClienteTwilioMemoria() };
}

describe("reenvio de boletos em lote", () => {
  it("o suporte não envia e o financeiro reenvia o aviso de emissão no modo teste", async () => {
    await ligar({ modoTeste: true });
    await passoEmissao(true);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591000000011"), "cliente.vivo@exemplo.test"));
    const fatura = await abrirFatura(cliente.id, { criadoEm: new Date("2024-01-01T12:00:00.000Z") });
    const bloqueado = clientesDeMemoria();

    await expect(
      reenviarBoletos(autor("SUPORTE"), { ids: [fatura.id] }, { ...bloqueado, agora: AGORA }),
    ).rejects.toMatchObject({ status: 403, codigo: "sem_permissao" });
    expect(bloqueado.caixa.caixa).toHaveLength(0);
    expect(bloqueado.twilio.enviados).toHaveLength(0);

    const { caixa, twilio } = clientesDeMemoria();
    const resultado = await reenviarBoletos(
      autor("FINANCEIRO"),
      { ids: [fatura.id, fatura.id, `  ${fatura.id}`] },
      { resend: caixa, twilio, agora: AGORA },
    );

    expect(resultado.modoTeste).toBe(true);
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]).toMatchObject({ email: "aceito", whatsapp: "aceito", nomeCliente: "Cliente do Reenvio" });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe(autor("FINANCEIRO").email);
    expect(caixa.caixa[0]?.para).not.toBe("cliente.vivo@exemplo.test");
    expect(caixa.caixa[0]?.assunto.startsWith("[Teste] ")).toBe(true);
    expect(caixa.caixa[0]?.texto).toContain("https://exemplo.test/boleto-reenvio");
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(twilio.enviados[0]?.para).not.toContain("13988881001");
    expect(twilio.enviados[0]?.contentSid).toBe(SID);
    expect(fetchSpy).not.toHaveBeenCalled();

    const segundo = await reenviarBoletos(autor("FINANCEIRO"), { ids: [fatura.id] }, { resend: caixa, twilio, agora: AGORA });
    expect(segundo.itens[0]?.email).toBe("aceito");
    expect(segundo.itens[0]?.whatsapp).toBe("ja_existia");
    expect(caixa.caixa).toHaveLength(2);
    expect(twilio.enviados).toHaveLength(1);
  });

  it("não manda fatura de outra empresa, pix, cartão, sem link, paga ou cancelada", async () => {
    await ligar({ modoTeste: false });
    await passoEmissao(false);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591000000021"), "boleto@exemplo.test", "Padaria"));
    const boa = await abrirFatura(cliente.id, { boletoUrl: "https://exemplo.test/boleto-bom" });
    const pix = await abrirFatura(cliente.id, { formaCobranca: "PIX", boletoUrl: null });
    const cartao = await abrirFatura(cliente.id, { formaCobranca: "CREDIT_CARD", boletoUrl: "https://exemplo.test/cartao" });
    const semLink = await abrirFatura(cliente.id, { boletoUrl: null });
    const paga = await abrirFatura(cliente.id, { status: "RECEIVED" });
    const cancelada = await abrirFatura(cliente.id, { excluida: true });
    const interPaga = await abrirFatura(cliente.id, { provedor: "INTER", status: "RECEBIDO" });
    const outroCliente = await criarCliente(
      outraEmpresaId,
      pessoa(completarCnpj("591000000022"), "outra@exemplo.test", "Outra Empresa"),
    );
    const alheia = await abrirFatura(outroCliente.id, {
      empresaId: outraEmpresaId,
      boletoUrl: "https://exemplo.test/boleto-alheio",
    });
    const { caixa, twilio } = clientesDeMemoria();

    const resultado = await reenviarBoletos(
      autor("DONO"),
      { ids: [boa.id, pix.id, cartao.id, semLink.id, paga.id, cancelada.id, interPaga.id, alheia.id, "id-inexistente"] },
      { resend: caixa, twilio, agora: AGORA },
    );

    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe("boleto@exemplo.test");
    expect(caixa.caixa[0]?.texto).toContain("https://exemplo.test/boleto-bom");
    expect(caixa.caixa[0]?.texto).not.toContain("boleto-alheio");
    expect(twilio.enviados).toHaveLength(0);
    expect(resultado.itens.find((item) => item.id === pix.id)?.emailMotivo).toBe("Não é boleto");
    expect(resultado.itens.find((item) => item.id === cartao.id)?.emailMotivo).toBe("Não é boleto");
    expect(resultado.itens.find((item) => item.id === semLink.id)?.emailMotivo).toBe("Sem boleto");
    expect(resultado.itens.find((item) => item.id === paga.id)?.emailMotivo).toBe("Não está em aberto");
    expect(resultado.itens.find((item) => item.id === cancelada.id)?.emailMotivo).toBe("Cancelada");
    expect(resultado.itens.find((item) => item.id === interPaga.id)?.emailMotivo).toBe("Não está em aberto");
    expect(resultado.itens.find((item) => item.id === alheia.id)).toMatchObject({
      nomeCliente: null,
      email: "ignorado",
      emailMotivo: "Não encontrada",
      whatsapp: "ignorado",
    });
    expect(resultado.itens.find((item) => item.id === "id-inexistente")?.emailMotivo).toBe("Não encontrada");
    expect(await prisma.lembreteRegua.count({ where: { faturaId: { in: [pix.id, cartao.id, alheia.id] } } })).toBe(0);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: alheia.id } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pula bloqueado, régua pausada, sem régua, promessa e não dispara a fila de outra fatura", async () => {
    await ligar({ modoTeste: true });
    await passoEmissao(true);
    const livre = await criarCliente(empresaId, pessoa(completarCnpj("591000000031"), "livre@exemplo.test", "Livre"));
    const alvo = await abrirFatura(livre.id, { boletoUrl: "https://exemplo.test/boleto-alvo" });
    const bloqueado = await criarCliente(empresaId, pessoa(completarCnpj("591000000032"), "bloqueado@exemplo.test", "Bloqueado"));
    await prisma.cliente.update({ where: { id: bloqueado.id }, data: { status: "BLOQUEADO" } });
    const faturaBloqueada = await abrirFatura(bloqueado.id);
    const pausado = await criarCliente(empresaId, pessoa(completarCnpj("591000000033"), "pausado@exemplo.test", "Pausado"));
    await prisma.cliente.update({ where: { id: pausado.id }, data: { reguaPausada: true } });
    const faturaPausada = await abrirFatura(pausado.id);
    const semRegua = await criarCliente(empresaId, pessoa(completarCnpj("591000000034"), "sem@exemplo.test", "Sem régua"));
    await atribuirReguaCliente(autor("DONO"), semRegua.id, { modo: "NENHUMA", pausada: false });
    const faturaSemRegua = await abrirFatura(semRegua.id);
    const prometido = await criarCliente(empresaId, pessoa(completarCnpj("591000000035"), "promessa@exemplo.test", "Promessa"));
    const faturaPromessa = await abrirFatura(prometido.id);
    await prisma.promessaPagamento.create({
      data: {
        empresaId,
        faturaId: faturaPromessa.id,
        clienteId: prometido.id,
        dataPrometida: new Date("2026-11-20T00:00:00.000Z"),
        valorPrometido: "150.00",
        canal: "WHATSAPP",
        status: "PENDENTE",
        registradaPorId: donoId,
      },
    });
    const vizinho = await criarCliente(empresaId, pessoa(completarCnpj("591000000036"), "vizinho@exemplo.test", "Vizinho"));
    const faturaVizinha = await abrirFatura(vizinho.id, { boletoUrl: "https://exemplo.test/boleto-vizinho" });
    const passo = await prisma.passoRegua.findFirstOrThrow({ where: { empresaId, naEmissao: true } });
    await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: faturaVizinha.id,
        clienteId: vizinho.id,
        passoId: passo.id,
        tipo: "BOLETO_GERADO",
        chaveIdempotencia: `wa:${empresaId}:${faturaVizinha.id}:${passo.id}:BOLETO_GERADO`,
        status: "PENDENTE",
        destino: "whatsapp:+5511999990000",
        disponivelEm: AGORA,
        modoTeste: true,
        rotulo: "WhatsApp · boleto gerado",
        variaveis: JSON.stringify({
          "1": "Vizinho",
          "2": "R$ 150,00",
          "3": "20/11/2026",
          "4": "https://exemplo.test/boleto-vizinho",
        }),
      },
    });
    const { caixa, twilio } = clientesDeMemoria();

    const resultado = await reenviarBoletos(
      autor("FINANCEIRO"),
      { ids: [alvo.id, faturaBloqueada.id, faturaPausada.id, faturaSemRegua.id, faturaPromessa.id] },
      { resend: caixa, twilio, agora: AGORA },
    );

    expect(caixa.caixa.map((item) => item.texto)).toEqual([expect.stringContaining("https://exemplo.test/boleto-alvo")]);
    expect(caixa.caixa[0]?.para).toBe(autor("FINANCEIRO").email);
    expect(twilio.enviados.map((item) => item.variaveis["4"])).toEqual(["https://exemplo.test/boleto-alvo"]);
    expect(resultado.itens.find((item) => item.id === faturaBloqueada.id)?.emailMotivo).toBe("Cliente bloqueado");
    expect(resultado.itens.find((item) => item.id === faturaPausada.id)?.emailMotivo).toBe("Régua pausada");
    expect(resultado.itens.find((item) => item.id === faturaSemRegua.id)?.emailMotivo).toBe("Sem régua");
    expect(resultado.itens.find((item) => item.id === faturaPromessa.id)?.emailMotivo).toBe("Promessa de pagamento");
    expect(await prisma.filaWhatsapp.findFirstOrThrow({ where: { faturaId: faturaVizinha.id } })).toMatchObject({
      status: "PENDENTE",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não fala com o cliente quando o WhatsApp oficial ainda não está liberado e redige falha de e-mail", async () => {
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
    await ligar({ modoTeste: false });
    await passoEmissao(true);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591000000041"), "oficial@exemplo.test"));
    const fatura = await abrirFatura(cliente.id);
    const twilio = criarClienteTwilioMemoria();
    const resend = {
      caixa: [] as string[],
      async enviar(dados: { chave: string }) {
        this.caixa.push(dados.chave);
        throw new Error(`falha ${CHAVE} no provedor`);
      },
    };

    const resultado = await reenviarBoletos(autor("DONO"), { ids: [fatura.id] }, { resend, twilio, agora: AGORA });

    expect(resultado.itens[0]?.email).toBe("falhou");
    expect(resultado.itens[0]?.emailMotivo).not.toContain(CHAVE);
    expect(resultado.itens[0]?.emailMotivo).toContain("re_[redigida]");
    expect(resultado.itens[0]?.whatsapp).toBe("nao_aplica");
    expect(twilio.enviados).toHaveLength(0);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: fatura.id } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recusa lote grande e estoura o limite sem enviar", async () => {
    await ligar();
    await passoEmissao(false);
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591000000051")));
    const fatura = await abrirFatura(cliente.id);
    const { caixa, twilio } = clientesDeMemoria();
    const ids = Array.from({ length: 41 }, (_, indice) => `id-${indice}`);

    await expect(reenviarBoletos(autor(), { ids }, { resend: caixa, twilio, agora: AGORA })).rejects.toBeInstanceOf(ErroAplicacao);
    await expect(reenviarBoletos(autor(), { ids: [] }, { resend: caixa, twilio, agora: AGORA })).rejects.toMatchObject({
      status: 400,
    });

    await prisma.lembreteRegua.createMany({
      data: Array.from({ length: 80 }, () => ({
        empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        canal: "EMAIL",
        status: "ENVIADO",
        automatico: false,
        modoTeste: true,
        rotulo: "Na emissão",
      })),
    });
    await expect(
      reenviarBoletos(autor(), { ids: [fatura.id] }, { resend: caixa, twilio, agora: AGORA }),
    ).rejects.toMatchObject({ status: 429, codigo: "limite_reenvio" });
    expect(caixa.caixa).toHaveLength(0);
    expect(twilio.enviados).toHaveLength(0);
  });

  it("a rota exige sessão e não reenvia fatura de outra empresa", async () => {
    expect(process.env.NODE_ENV).not.toBe("production");
    await ligar({ modoTeste: false });
    await passoEmissao(true);
    const pedido = new Request("http://127.0.0.1/api/faturas/reenviar-boletos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["qualquer"] }),
    });
    expect((await POST(pedido)).status).toBe(401);

    const suporte = await prisma.usuario.create({
      data: {
        nome: "Suporte",
        email: `suporte-${empresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId,
        papel: "SUPORTE",
      },
    });
    cookieJar.valor = await emitirToken({
      sub: suporte.id,
      email: suporte.email,
      nome: suporte.nome,
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
      versaoSessao: 0,
    });
    const negado = await POST(
      new Request("http://127.0.0.1/api/faturas/reenviar-boletos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["qualquer"] }),
      }),
    );
    expect(negado.status).toBe(403);

    const financeiro = await prisma.usuario.create({
      data: {
        nome: "Financeiro",
        email: `financeiro-${empresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId,
        papel: "FINANCEIRO",
      },
    });
    const outroCliente = await criarCliente(
      outraEmpresaId,
      pessoa(completarCnpj("591000000061"), "alheia@exemplo.test", "Alheia"),
    );
    const alheia = await abrirFatura(outroCliente.id, { empresaId: outraEmpresaId });
    cookieJar.valor = await emitirToken({
      sub: financeiro.id,
      email: financeiro.email,
      nome: financeiro.nome,
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
      versaoSessao: 0,
    });
    const resposta = await POST(
      new Request("http://127.0.0.1/api/faturas/reenviar-boletos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [alheia.id, "<script>"] }),
      }),
    );
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { itens: { id: string; emailMotivo: string | null; nomeCliente: string | null }[] };
    expect(corpo.itens.map((item) => item.emailMotivo)).toEqual(["Não encontrada", "Não encontrada"]);
    expect(corpo.itens.every((item) => item.nomeCliente === null)).toBe(true);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: alheia.id } })).toBe(0);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId: outraEmpresaId } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const anonimo = new NextRequest("http://127.0.0.1/api/faturas/reenviar-boletos", { method: "POST" });
    expect((await middleware(anonimo)).status).toBe(401);
    const tokenSuporte = await emitirToken({
      sub: suporte.id,
      email: suporte.email,
      nome: suporte.nome,
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
    });
    expect(
      (
        await middleware(
          new NextRequest("http://127.0.0.1/api/faturas/reenviar-boletos", {
            method: "POST",
            headers: { cookie: `${COOKIE_SESSAO}=${tokenSuporte}` },
          }),
        )
      ).status,
    ).toBe(403);
  });
});
