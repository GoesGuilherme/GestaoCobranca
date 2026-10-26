import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/regua/route";
import { middleware } from "@/middleware";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarCliente } from "./cliente-service";
import { executarRegua } from "./regua-job";
import {
  atribuirReguaCliente,
  atualizarRegua,
  criarRegua,
  enviarEmailTesteRegua,
  enviarLembreteAgora,
  obterPainelRegua,
  salvarConfiguracaoRegua,
} from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

usarBancoDeTeste();

const CHAVE = "re_teste_local_nao_enviar_0001";
const AGORA = new Date("2026-10-26T15:00:00.000Z");
const SABADO = new Date("2026-10-24T15:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Régua", cnpj: completarCnpj("590000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Régua", cnpj: completarCnpj("590000000002") })
  ).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono Régua",
      email: `dono-${empresaId}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId,
      papel: "DONO",
    },
  });
});

function autor(papel: PapelUsuario, id = empresaId) {
  return {
    empresaId: id,
    papel,
    email: papel === "DONO" ? `dono-${id}@exemplo.test` : `pessoa-${papel.toLowerCase()}@exemplo.test`,
    nomeEmpresa: "Empresa Régua",
  };
}

function cliente(documento: string, email = "cliente.regua@exemplo.test") {
  return {
    nomeFantasia: "Cliente da Régua",
    razaoSocial: "Cliente da Régua Ltda",
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
    remetenteNome: "Empresa Régua",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE,
    ...extra,
  });
}

async function umPasso(dias: number, assunto: string, corpo = "Olá, {cliente}. {empresa} cobra {dias_atraso}. {link}") {
  const painel = await obterPainelRegua(autor("DONO"));
  const regua = painel.reguas[0];
  return atualizarRegua(autor("DONO"), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: [{ id: regua.passos[0]?.id, naEmissao: false, dias, canal: "EMAIL", assunto, corpo }],
  });
}

async function abrirFatura(clienteId: string, vencimento: string, criadoEm = `${vencimento}T15:00:00.000Z`) {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date(`${vencimento}T00:00:00.000Z`),
      status: "PENDING",
      formaCobranca: "BOLETO",
      boletoUrl: "https://exemplo.test/cobranca",
      descricao: "Serviço exemplo",
      criadoEm: new Date(criadoEm),
    },
  });
}

describe("régua de cobrança", () => {
  it("ao ligar, grava a sugestão só nesta empresa e só uma vez", async () => {
    const painel = await ligar();
    expect(painel.config.ativa).toBe(true);
    expect(painel.config.modoTeste).toBe(true);
    expect(painel.reguas).toHaveLength(1);
    expect(painel.reguas[0]?.nome).toBe("Padrão");
    expect(painel.reguas[0]?.padrao).toBe(true);
    expect(painel.reguas[0]?.passos.map((passo) => passo.rotulo)).toEqual([
      "Na emissão",
      "5 dias antes",
      "No vencimento",
      "3 dias de atraso",
      "7 dias de atraso",
    ]);
    expect(painel.reguas[0]?.passos[0]?.assunto).toContain("{empresa}");

    const deNovo = await ligar();
    expect(deNovo.reguas).toHaveLength(1);
    expect(deNovo.reguas[0]?.passos).toHaveLength(5);
    expect(await prisma.reguaCobranca.count({ where: { empresaId: outraEmpresaId } })).toBe(0);
  });

  it("financeiro não grava a régua e o suporte nem entra na rota", async () => {
    await expect(ligar()).resolves.toBeTruthy();
    await expect(
      salvarConfiguracaoRegua(autor("FINANCEIRO"), {
        ativa: false,
        modoTeste: true,
        remetenteNome: "",
        remetenteEmail: "",
        replyTo: "",
      }),
    ).rejects.toMatchObject({ status: 403 });

    const token = await emitirToken({
      sub: "usuario-suporte",
      email: "suporte@exemplo.test",
      nome: "Suporte",
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
    });
    const pedido = new NextRequest("http://127.0.0.1/regua", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });
    const resposta = await middleware(pedido);
    expect(resposta.status).toBe(403);

    const api = new NextRequest("http://127.0.0.1/api/regua", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });
    expect((await middleware(api)).status).toBe(403);

    const financeiro = await emitirToken({
      sub: "usuario-financeiro",
      email: "financeiro@exemplo.test",
      nome: "Financeiro",
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
    });
    const liberado = await middleware(
      new NextRequest("http://127.0.0.1/regua", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }),
    );
    expect(liberado.status).toBe(200);
  });

  it("guarda a chave cifrada e o teste vai para quem está logado", async () => {
    const painel = await ligar();
    expect(painel.config.configurada).toBe(true);
    expect(JSON.stringify(painel)).not.toContain(CHAVE);
    const linha = await prisma.configuracaoRegua.findUniqueOrThrow({ where: { empresaId } });
    expect(linha.chaveResendCifrada?.startsWith("v1:")).toBe(true);
    expect(linha.chaveResendCifrada).not.toContain(CHAVE);

    const caixa = clienteResendMemoria();
    await enviarEmailTesteRegua(autor("DONO"), { resend: caixa });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe(autor("DONO").email);
    expect(caixa.caixa[0]?.para).not.toBe("cliente.regua@exemplo.test");
  });

  it("recusa WhatsApp", async () => {
    await expect(
      criarRegua(autor("DONO"), {
        nome: "Canal futuro",
        padrao: false,
        horaInicio: 8,
        horaFim: 18,
        enviarFimDeSemana: false,
        passos: [{ naEmissao: false, dias: 0, canal: "WHATSAPP", assunto: "Oi", corpo: "Texto" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("no modo teste manda para o dono; desligado, para o cliente, uma vez", async () => {
    await ligar();
    await umPasso(0, "Sua cobrança vence hoje");
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000003")));
    await abrirFatura(pessoa.id, "2026-10-26");
    const caixa = clienteResendMemoria();

    const teste = await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(teste.enviados).toBe(1);
    expect(caixa.caixa[0]?.para).toBe(autor("DONO").email);
    expect(caixa.caixa[0]?.para).not.toBe("cliente.regua@exemplo.test");
    expect(caixa.caixa[0]?.assunto.startsWith("[Teste] ")).toBe(true);
    expect(caixa.caixa[0]?.texto).toContain("Modo teste");

    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(1);

    await salvarConfiguracaoRegua(autor("DONO"), {
      ativa: true,
      modoTeste: false,
      remetenteNome: "Empresa Régua",
      remetenteEmail: "cobranca@exemplo.test",
      replyTo: "",
    });
    const outra = await criarCliente(empresaId, cliente(completarCnpj("590000000004"), "vivo@exemplo.test"));
    await abrirFatura(outra.id, "2026-10-26");
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa[1]?.para).toBe("vivo@exemplo.test");
    expect(caixa.caixa[1]?.assunto.startsWith("[Teste]")).toBe(false);
  });

  it("pula paga, excluída, pausada, sem e-mail e sem régua", async () => {
    await ligar({ modoTeste: false });
    await umPasso(0, "No dia");
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000005"), "antes@exemplo.test"));
    await prisma.cliente.update({ where: { id: pessoa.id }, data: { email: "" } });
    const fatura = await abrirFatura(pessoa.id, "2026-10-26");
    const caixa = clienteResendMemoria();

    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: fatura.id, motivo: "cliente sem e-mail" } })).toBe(1);

    await prisma.cliente.update({ where: { id: pessoa.id }, data: { email: "depois@exemplo.test" } });
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa[0]?.para).toBe("depois@exemplo.test");

    await prisma.cliente.update({ where: { id: pessoa.id }, data: { reguaPausada: true } });
    const pausada = await abrirFatura(pessoa.id, "2026-10-26");
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(1);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: pausada.id, motivo: "régua pausada" } })).toBe(1);

    await prisma.fatura.update({ where: { id: fatura.id }, data: { status: "RECEIVED" } });
    const antes = caixa.caixa.length;
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(antes);

    const cancelada = await abrirFatura(pessoa.id, "2026-10-26");
    await prisma.fatura.update({ where: { id: cancelada.id }, data: { excluida: true, status: "PENDING" } });
    await prisma.cliente.update({ where: { id: pessoa.id }, data: { reguaPausada: false } });
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(await prisma.lembreteRegua.count({ where: { faturaId: cancelada.id } })).toBe(0);

    await atribuirReguaCliente(autor("DONO"), pessoa.id, { modo: "NENHUMA", pausada: false });
    const sem = await abrirFatura(pessoa.id, "2026-10-26");
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(await prisma.lembreteRegua.count({ where: { faturaId: sem.id, motivo: "sem régua" } })).toBe(1);
  });

  it("não envia no fim de semana e recupera o sábado na segunda", async () => {
    await ligar({ modoTeste: false });
    await umPasso(0, "No vencimento");
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000006")));
    const sabado = await abrirFatura(pessoa.id, "2026-10-24");
    const sexta = await abrirFatura(pessoa.id, "2026-10-23");
    const caixa = clienteResendMemoria();

    await executarRegua({ agora: SABADO, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: sabado.id } })).toBe(0);

    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa.map((item) => item.para)).toEqual(["cliente.regua@exemplo.test"]);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: sexta.id, status: "ENVIADO" } })).toBe(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: sabado.id, status: "ENVIADO" } })).toBe(1);
  });

  it("o cliente na régua nomeada não usa os passos da padrão", async () => {
    await ligar({ modoTeste: false });
    await umPasso(0, "Régua padrão");
    const criada = await criarRegua(autor("DONO"), {
      nome: "Outra régua",
      padrao: false,
      horaInicio: 8,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [
        {
          naEmissao: false,
          dias: 3,
          canal: "EMAIL",
          assunto: "Régua específica",
          corpo: "Atraso {dias_atraso} para {cliente}",
        },
      ],
    });
    const especifica = criada.reguas.find((regua) => regua.nome === "Outra régua");
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000007")));
    await atribuirReguaCliente(autor("DONO"), pessoa.id, {
      modo: "ESPECIFICA",
      reguaId: especifica?.id,
      pausada: false,
    });
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: pessoa.id } })).reguaModo).toBe("ESPECIFICA");
    await abrirFatura(pessoa.id, "2026-10-26");
    const caixa = clienteResendMemoria();
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(0);

    await executarRegua({ agora: new Date("2026-10-29T15:00:00.000Z"), empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.assunto).toBe("Régua específica");
    expect(caixa.caixa[0]?.texto).toContain("Atraso 3");
  });

  it("enviar agora respeita o modo teste e a pausa não impede o manual", async () => {
    await ligar();
    const painel = await umPasso(0, "Manual");
    const passoId = painel.reguas[0]?.passos[0]?.id ?? "";
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000008")));
    await atribuirReguaCliente(autor("FINANCEIRO"), pessoa.id, { modo: "PADRAO", pausada: true });
    const fatura = await abrirFatura(pessoa.id, "2026-10-26");
    const caixa = clienteResendMemoria();
    const lembrete = await enviarLembreteAgora(autor("FINANCEIRO"), fatura.id, { passoId }, { resend: caixa, agora: AGORA });
    expect(lembrete.destino).toBe(autor("FINANCEIRO").email);
    expect(lembrete.automatico).toBe(false);
    expect(lembrete.modoTeste).toBe(true);
    await enviarLembreteAgora(autor("FINANCEIRO"), fatura.id, { passoId }, { resend: caixa, agora: AGORA });
    expect(caixa.caixa).toHaveLength(2);
    expect(caixa.caixa.every((item) => item.para !== "cliente.regua@exemplo.test")).toBe(true);
  });

  it("fora da janela não registra lembrete e o cron exige o segredo", async () => {
    await ligar({ modoTeste: false });
    const painel = await obterPainelRegua(autor("DONO"));
    const regua = painel.reguas[0];
    await atualizarRegua(autor("DONO"), regua.id, {
      nome: regua.nome,
      padrao: true,
      horaInicio: 14,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [{ id: regua.passos[0]?.id, naEmissao: false, dias: 0, canal: "EMAIL", assunto: "Tarde", corpo: "Texto {cliente}" }],
    });
    const pessoa = await criarCliente(empresaId, cliente(completarCnpj("590000000009")));
    const fatura = await abrirFatura(pessoa.id, "2026-10-26");
    const caixa = clienteResendMemoria();
    await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: fatura.id } })).toBe(0);

    const original = globalThis.fetch;
    const chamadas: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      chamadas.push(String(input));
      throw new Error("rede bloqueada");
    }) as typeof fetch;
    try {
      await executarRegua({ agora: new Date("2026-10-26T18:00:00.000Z"), empresaId, resend: caixa });
      const segunda = await abrirFatura(pessoa.id, "2026-10-26");
      await executarRegua({ agora: new Date("2026-10-26T18:00:00.000Z"), empresaId });
      expect(await prisma.lembreteRegua.count({ where: { faturaId: segunda.id, status: "ENVIADO" } })).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
    expect(caixa.caixa).toHaveLength(1);
    expect(chamadas.some((url) => url.includes("api.resend.com"))).toBe(false);

    const anterior = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await cronGet(new Request("http://127.0.0.1/api/cron/regua"))).status).toBe(500);
    process.env.CRON_SECRET = "segredo-cron-de-teste";
    expect(
      (await cronPost(new Request("http://127.0.0.1/api/cron/regua", { method: "POST", headers: { authorization: "Bearer errado" } }))).status,
    ).toBe(401);
    const ok = await cronGet(
      new Request("http://127.0.0.1/api/cron/regua", { headers: { "x-cron-secret": "segredo-cron-de-teste" } }),
    );
    expect(ok.status).toBe(200);
    if (anterior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = anterior;
  });
});
