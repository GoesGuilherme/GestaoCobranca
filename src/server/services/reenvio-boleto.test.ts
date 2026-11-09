import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { completarCnpj } from "@/lib/documento";
import { LIMITE_REENVIO_BOLETOS } from "@/lib/reenvio-boleto";
import type { PapelUsuario } from "@/lib/tipos";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { clienteResendMemoria, type ClienteResend, type EmailResend } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { REMETENTE_OFICIAL_WHATSAPP } from "@/server/twilio/sandbox";
import { criarCliente } from "./cliente-service";
import { reenviarBoletos } from "./reenvio-boleto-service";
import {
  atribuirReguaCliente,
  atualizarRegua,
  criarRegua,
  obterPainelRegua,
  salvarConfiguracaoRegua,
} from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

usarBancoDeTeste();

const CHAVE = "re_teste_local_nao_enviar_0001";
const AGORA = new Date("2026-10-26T15:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Reenvio", cnpj: completarCnpj("591100000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Vizinha Reenvio", cnpj: completarCnpj("591100000002") })
  ).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono Reenvio",
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
    nomeEmpresa: "Empresa Reenvio",
  };
}

function pessoa(documento: string, email = "cliente.reenvio@exemplo.test") {
  return {
    nomeFantasia: "Cliente do Reenvio",
    razaoSocial: "Cliente do Reenvio Ltda",
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
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE,
    ...extra,
  });
}

async function abrirFatura(
  clienteId: string,
  extra: {
    empresa?: string;
    forma?: string;
    boletoUrl?: string | null;
    faturaUrl?: string | null;
    status?: string;
    excluida?: boolean;
    provedor?: "ASAAS" | "INTER";
    vencimento?: string;
    criadoEm?: Date;
  } = {},
) {
  return prisma.fatura.create({
    data: {
      empresaId: extra.empresa ?? empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date(`${extra.vencimento ?? "2026-10-26"}T00:00:00.000Z`),
      ...(extra.criadoEm ? { criadoEm: extra.criadoEm } : {}),
      status: extra.status ?? "PENDING",
      provedor: extra.provedor ?? "ASAAS",
      formaCobranca: extra.forma ?? "BOLETO",
      boletoUrl: extra.boletoUrl === undefined ? "https://exemplo.test/boleto" : extra.boletoUrl,
      faturaUrl: extra.faturaUrl ?? null,
      descricao: "Serviço exemplo",
      excluida: extra.excluida ?? false,
    },
  });
}

function canal(resultado: { itens: { id: string; canais: { canal: string; resultado: string; motivo: string | null }[] }[] }, id: string, nome: "EMAIL" | "WHATSAPP") {
  return resultado.itens.find((item) => item.id === id)?.canais.find((parte) => parte.canal === nome);
}

describe("reenvio de boletos em lote", () => {
  it("o suporte não entra na rota e quem não cobra não dispara", async () => {
    const anonimo = await middleware(
      new NextRequest("http://127.0.0.1/api/faturas/reenviar-boletos", { method: "POST" }),
    );
    expect(anonimo.status).toBe(401);

    const suporte = await emitirToken({
      sub: "usuario-suporte",
      email: "suporte@exemplo.test",
      nome: "Suporte",
      empresaId,
      papel: "SUPORTE",
      superadministrador: false,
    });
    const bloqueado = await middleware(
      new NextRequest("http://127.0.0.1/api/faturas/reenviar-boletos", {
        method: "POST",
        headers: { cookie: `${COOKIE_SESSAO}=${suporte}` },
      }),
    );
    expect(bloqueado.status).toBe(403);

    const financeiro = await emitirToken({
      sub: "usuario-financeiro",
      email: "financeiro@exemplo.test",
      nome: "Financeiro",
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
    });
    const liberado = await middleware(
      new NextRequest("http://127.0.0.1/api/faturas/reenviar-boletos", {
        method: "POST",
        headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` },
      }),
    );
    expect(liberado.status).toBe(200);

    await expect(reenviarBoletos(autor("SUPORTE"), { ids: ["faturaqualquer"] })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
  });

  it("reenvia só o e-mail de emissão dos boletos da própria empresa", async () => {
    await ligar({ modoTeste: false });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000003")));
    const boleto = await abrirFatura(cliente.id);
    const boletoPix = await abrirFatura(cliente.id, { forma: "BOLETO_PIX" });
    const pix = await abrirFatura(cliente.id, { forma: "PIX", boletoUrl: null, faturaUrl: "https://exemplo.test/pix" });
    const cartao = await abrirFatura(cliente.id, {
      forma: "CREDIT_CARD",
      boletoUrl: null,
      faturaUrl: "https://exemplo.test/cartao",
    });
    const indefinida = await abrirFatura(cliente.id, { forma: "UNDEFINED", boletoUrl: null, faturaUrl: "https://exemplo.test/escolhe" });
    const semLink = await abrirFatura(cliente.id, { boletoUrl: null });
    const paga = await abrirFatura(cliente.id, { status: "RECEIVED" });
    const cancelada = await abrirFatura(cliente.id, { excluida: true });
    const inter = await abrirFatura(cliente.id, { provedor: "INTER", status: "A_RECEBER" });
    const interPaga = await abrirFatura(cliente.id, { provedor: "INTER", status: "RECEBIDO" });

    const vizinho = await criarCliente(outraEmpresaId, pessoa(completarCnpj("591100000004"), "vizinho@exemplo.test"));
    const faturaVizinha = await abrirFatura(vizinho.id, { empresa: outraEmpresaId });

    const caixa = clienteResendMemoria();
    const repetido = boleto.id;
    const resultado = await reenviarBoletos(
      autor("FINANCEIRO"),
      { ids: [boleto.id, repetido, boletoPix.id, pix.id, cartao.id, indefinida.id, semLink.id, paga.id, cancelada.id, inter.id, interPaga.id, faturaVizinha.id, "naoexiste1"] },
      { resend: caixa, agora: AGORA },
    );

    expect(caixa.caixa).toHaveLength(3);
    expect(caixa.caixa.every((item) => item.para === "cliente.reenvio@exemplo.test")).toBe(true);
    expect(caixa.caixa.every((item) => item.assunto.startsWith("Cobrança de Empresa Reenvio"))).toBe(true);
    expect(caixa.caixa.some((item) => item.assunto.includes("vence"))).toBe(false);
    expect(caixa.caixa.every((item) => item.texto.includes("https://exemplo.test/boleto"))).toBe(true);
    expect(caixa.caixa.some((item) => item.texto.includes("modo teste") || item.texto.includes("Modo teste"))).toBe(false);
    expect(resultado.email.aceitos).toBe(3);
    expect(resultado.whatsapp.aceitos).toBe(0);
    expect(resultado.modoTeste).toBe(false);
    expect(canal(resultado, pix.id, "EMAIL")?.motivo).toBe("Sem boleto.");
    expect(canal(resultado, pix.id, "WHATSAPP")?.motivo).toBe("Sem boleto.");
    expect(canal(resultado, cartao.id, "WHATSAPP")?.motivo).toBe("Sem boleto.");
    expect(canal(resultado, indefinida.id, "WHATSAPP")?.motivo).toBe("Sem boleto.");
    expect(canal(resultado, semLink.id, "EMAIL")?.motivo).toBe("Sem link do boleto.");
    expect(canal(resultado, paga.id, "EMAIL")?.motivo).toBe("Cobrança não está em aberto.");
    expect(canal(resultado, cancelada.id, "EMAIL")?.motivo).toBe("Cobrança não está em aberto.");
    expect(canal(resultado, interPaga.id, "EMAIL")?.motivo).toBe("Cobrança não está em aberto.");
    expect(canal(resultado, faturaVizinha.id, "EMAIL")?.motivo).toBe("Fatura não encontrada.");
    expect(canal(resultado, "naoexiste1", "WHATSAPP")?.motivo).toBe("Fatura não encontrada.");
    expect(canal(resultado, boleto.id, "WHATSAPP")?.motivo).toBe("Este passo não envia WhatsApp.");
    expect(resultado.itens.filter((item) => item.id === boleto.id)).toHaveLength(1);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: faturaVizinha.id } })).toBe(0);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId } })).toBe(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: boleto.id, automatico: false, status: "ENVIADO" } })).toBe(1);
  });

  it("no modo teste o e-mail vai para quem está logado e a pausa não segura o manual", async () => {
    await ligar({ modoTeste: true });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000005")));
    await atribuirReguaCliente(autor("FINANCEIRO"), cliente.id, { modo: "PADRAO", pausada: true });
    await prisma.cliente.update({ where: { id: cliente.id }, data: { status: "BLOQUEADO" } });
    const boleto = await abrirFatura(cliente.id);
    const caixa = clienteResendMemoria();
    const resultado = await reenviarBoletos(autor("FINANCEIRO"), { ids: [boleto.id] }, { resend: caixa, agora: AGORA });
    expect(resultado.email.aceitos).toBe(1);
    expect(resultado.modoTeste).toBe(true);
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe(autor("FINANCEIRO").email);
    expect(caixa.caixa[0]?.texto.startsWith("Modo teste:")).toBe(true);
    expect(caixa.caixa[0]?.para).not.toBe("cliente.reenvio@exemplo.test");
  });

  it("usa a emissão da régua específica e ignora quem não tem esse passo", async () => {
    await ligar({ modoTeste: false });
    const criada = await criarRegua(autor("DONO"), {
      nome: "Régua do lote",
      padrao: false,
      horaInicio: 8,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [
        {
          naEmissao: true,
          dias: null,
          canal: "EMAIL",
          assunto: "Boleto da régua específica",
          corpo: "Link do boleto: {link}",
        },
        {
          naEmissao: false,
          dias: 0,
          canal: "EMAIL",
          assunto: "Vence hoje e não deve sair",
          corpo: "Este passo não é o reenvio.",
        },
      ],
    });
    const especifica = criada.reguas.find((regua) => regua.nome === "Régua do lote");
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000006")));
    await atribuirReguaCliente(autor("DONO"), cliente.id, { modo: "ESPECIFICA", reguaId: especifica?.id, pausada: false });
    const semRegua = await criarCliente(empresaId, pessoa(completarCnpj("591100000007"), "semregua@exemplo.test"));
    await atribuirReguaCliente(autor("DONO"), semRegua.id, { modo: "NENHUMA", pausada: false });
    const boleto = await abrirFatura(cliente.id);
    const outro = await abrirFatura(semRegua.id);
    const caixa = clienteResendMemoria();
    const resultado = await reenviarBoletos(
      autor("DONO"),
      { ids: [boleto.id, outro.id] },
      { resend: caixa, agora: AGORA },
    );
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.assunto).toBe("Boleto da régua específica");
    expect(caixa.caixa[0]?.texto).toContain("https://exemplo.test/boleto");
    expect(caixa.caixa[0]?.texto).not.toContain("não deve sair");
    expect(canal(resultado, outro.id, "EMAIL")?.motivo).toBe("Cliente sem régua.");
    expect(canal(resultado, outro.id, "WHATSAPP")?.motivo).toBe("Cliente sem régua.");
  });

  it("sem passo de emissão, sem e-mail ou sem régua configurada não chama a Resend", async () => {
    await ligar({ modoTeste: false });
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
          id: regua.passos.find((passo) => !passo.naEmissao)?.id,
          naEmissao: false,
          dias: 0,
          canal: "EMAIL",
          assunto: "Só no vencimento",
          corpo: "Não é emissão.",
        },
      ],
    });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000008")));
    const boleto = await abrirFatura(cliente.id);
    const caixa = clienteResendMemoria();
    const semPasso = await reenviarBoletos(autor("DONO"), { ids: [boleto.id] }, { resend: caixa, agora: AGORA });
    expect(semPasso.email.aceitos).toBe(0);
    expect(canal(semPasso, boleto.id, "EMAIL")?.motivo).toBe("Sem passo de emissão na régua.");
    expect(canal(semPasso, boleto.id, "WHATSAPP")?.motivo).toBe("Sem passo de emissão na régua.");
    expect(caixa.caixa).toHaveLength(0);

    await prisma.configuracaoRegua.deleteMany({ where: { empresaId } });
    const semConfig = await reenviarBoletos(autor("DONO"), { ids: [boleto.id] }, { resend: caixa, agora: AGORA });
    expect(canal(semConfig, boleto.id, "EMAIL")?.motivo).toBe("Sem passo de emissão na régua.");
    expect(caixa.caixa).toHaveLength(0);
  });

  it("cliente sem e-mail é ignorado e uma falha não interrompe o lote nem vaza a chave", async () => {
    await ligar({ modoTeste: false });
    const semEmail = await criarCliente(empresaId, pessoa(completarCnpj("591100000009"), "sem-email@exemplo.test"));
    await prisma.cliente.update({ where: { id: semEmail.id }, data: { email: "" } });
    const comEmail = await criarCliente(empresaId, pessoa(completarCnpj("591100000010"), "ok.reenvio@exemplo.test"));
    const falha = await criarCliente(empresaId, pessoa(completarCnpj("591100000011"), "falha.reenvio@exemplo.test"));
    const a = await abrirFatura(semEmail.id);
    const b = await abrirFatura(comEmail.id);
    const c = await abrirFatura(falha.id);
    const base = clienteResendMemoria();
    const resend: ClienteResend & { caixa: EmailResend[] } = {
      caixa: base.caixa,
      async enviar(dados) {
        if (dados.para === "falha.reenvio@exemplo.test") {
          throw new Error(`recusa com ${CHAVE} no detalhe`);
        }
        return base.enviar(dados);
      },
    };
    const resultado = await reenviarBoletos(autor("DONO"), { ids: [a.id, b.id, c.id] }, { resend, agora: AGORA });
    expect(canal(resultado, a.id, "EMAIL")?.motivo).toBe("O cliente não tem e-mail.");
    expect(canal(resultado, b.id, "EMAIL")?.resultado).toBe("aceito");
    expect(canal(resultado, c.id, "EMAIL")?.resultado).toBe("falha");
    expect(canal(resultado, c.id, "EMAIL")?.motivo ?? "").not.toContain(CHAVE);
    expect(JSON.stringify(resultado)).not.toContain(CHAVE);
    expect(base.caixa.map((item) => item.para)).toEqual(["ok.reenvio@exemplo.test"]);
  });

  it("o WhatsApp sai pelo mesmo caminho da régua e não cria outro envio", async () => {
    const anterior = {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_WEBHOOK_URL: process.env.TWILIO_WEBHOOK_URL,
      TWILIO_WHATSAPP_TESTE: process.env.TWILIO_WHATSAPP_TESTE,
      TWILIO_CONTENT_SID_BOLETO_GERADO: process.env.TWILIO_CONTENT_SID_BOLETO_GERADO,
      TWILIO_WHATSAPP_SENDER_OFICIAL: process.env.TWILIO_WHATSAPP_SENDER_OFICIAL,
      TWILIO_WHATSAPP_OFICIAL_DESDE: process.env.TWILIO_WHATSAPP_OFICIAL_DESDE,
      TWILIO_WHATSAPP_SANDBOX: process.env.TWILIO_WHATSAPP_SANDBOX,
      TWILIO_MOCK: process.env.TWILIO_MOCK,
    };
    const restaurar = () => {
      for (const [chave, valor] of Object.entries(anterior)) {
        if (valor === undefined) delete process.env[chave];
        else process.env[chave] = valor;
      }
    };
    process.env.TWILIO_ACCOUNT_SID = `AC${"b".repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
    process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
    process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
    process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = "HXd3e534c278f4db0f03267127c8f8ea42";
    process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
    delete process.env.TWILIO_MOCK;
    delete process.env.TWILIO_WHATSAPP_SANDBOX;
    delete process.env.TWILIO_WHATSAPP_OFICIAL_DESDE;
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("rede proibida no teste"))) as typeof fetch;
    try {
      await ligar({ modoTeste: true });
      const painel = await obterPainelRegua(autor("DONO"));
      const regua = painel.reguas[0];
      await atualizarRegua(autor("DONO"), regua.id, {
        nome: regua.nome,
        padrao: true,
        horaInicio: 8,
        horaFim: 18,
        enviarFimDeSemana: false,
        passos: [{
          id: regua.passos.find((passo) => passo.naEmissao)?.id,
          naEmissao: true,
          dias: null,
          canal: "EMAIL",
          assunto: "Boleto emitido",
          corpo: "Link {link}",
          enviarWhatsapp: true,
        }],
      });
      const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000013")));
      const boleto = await abrirFatura(cliente.id);
      const pix = await abrirFatura(cliente.id, { forma: "PIX", boletoUrl: null, faturaUrl: "https://exemplo.test/pix" });
      const twilio = criarClienteTwilioMemoria();
      const caixa = clienteResendMemoria();
      const primeiro = await reenviarBoletos(autor("DONO"), { ids: [boleto.id, pix.id] }, { resend: caixa, twilio, agora: AGORA });
      expect(canal(primeiro, boleto.id, "EMAIL")?.resultado).toBe("aceito");
      expect(canal(primeiro, boleto.id, "WHATSAPP")?.resultado).toBe("aceito");
      expect(canal(primeiro, pix.id, "WHATSAPP")?.motivo).toBe("Sem boleto.");
      expect(twilio.enviados).toHaveLength(1);
      expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
      expect(twilio.enviados[0]?.para).not.toContain("5513988881001");
      expect(twilio.enviados[0]?.contentSid).toBe("HXd3e534c278f4db0f03267127c8f8ea42");
      expect(twilio.enviados[0]?.de).toBe(REMETENTE_OFICIAL_WHATSAPP);
      expect(caixa.caixa[0]?.para).toBe(autor("DONO").email);
      expect(await prisma.filaWhatsapp.count({ where: { faturaId: pix.id } })).toBe(0);

      const segundo = await reenviarBoletos(autor("DONO"), { ids: [boleto.id] }, { resend: caixa, twilio, agora: AGORA });
      expect(canal(segundo, boleto.id, "EMAIL")?.resultado).toBe("aceito");
      expect(canal(segundo, boleto.id, "WHATSAPP")?.motivo).toBe("WhatsApp já aceito neste passo.");
      expect(twilio.enviados).toHaveLength(1);

      await ligar({ modoTeste: false });
      process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2099-01-01T00:00:00.000Z";
      const antiga = await abrirFatura(cliente.id, { criadoEm: new Date("2026-10-01T00:00:00.000Z") });
      const foraDaData = await reenviarBoletos(autor("DONO"), { ids: [antiga.id] }, { resend: caixa, twilio, agora: AGORA });
      expect(canal(foraDaData, antiga.id, "WHATSAPP")?.motivo).toBe("WhatsApp oficial ainda não vale para esta cobrança.");
      expect(twilio.enviados).toHaveLength(1);
      expect(await prisma.filaWhatsapp.count({ where: { faturaId: antiga.id } })).toBe(0);

      const semNumero = await criarCliente(empresaId, pessoa(completarCnpj("591100000014"), "sem.whatsapp@exemplo.test"));
      await prisma.cliente.update({ where: { id: semNumero.id }, data: { whatsapp: "" } });
      process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-01-01T00:00:00.000Z";
      const semZap = await abrirFatura(semNumero.id, { criadoEm: new Date("2026-10-26T12:00:00.000Z") });
      const semTelefone = await reenviarBoletos(autor("DONO"), { ids: [semZap.id] }, { resend: caixa, twilio, agora: AGORA });
      expect(canal(semTelefone, semZap.id, "WHATSAPP")?.motivo).toBe("cliente sem WhatsApp");
      expect(twilio.enviados).toHaveLength(1);

      const recente = await abrirFatura(cliente.id, { criadoEm: new Date("2026-10-26T12:00:00.000Z") });
      const producao = await reenviarBoletos(autor("DONO"), { ids: [recente.id] }, { resend: caixa, twilio, agora: AGORA });
      expect(canal(producao, recente.id, "WHATSAPP")?.resultado).toBe("aceito");
      expect(twilio.enviados.at(-1)?.para).toBe("whatsapp:+5513988881001");
      expect(twilio.enviados.at(-1)?.de).toBe(REMETENTE_OFICIAL_WHATSAPP);
    } finally {
      globalThis.fetch = fetchOriginal;
      restaurar();
    }
  });

  it("rejeita corpo inválido e lote acima do limite antes de enviar", async () => {
    await ligar({ modoTeste: false });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("591100000012")));
    const boleto = await abrirFatura(cliente.id);
    const caixa = clienteResendMemoria();
    await expect(reenviarBoletos(autor("DONO"), { ids: [] }, { resend: caixa })).rejects.toMatchObject({ status: 400 });
    await expect(reenviarBoletos(autor("DONO"), { ids: ["<script>"] }, { resend: caixa })).rejects.toMatchObject({ status: 400 });
    await expect(reenviarBoletos(autor("DONO"), { ids: "boleto" }, { resend: caixa })).rejects.toMatchObject({ status: 400 });
    const muitos = Array.from({ length: LIMITE_REENVIO_BOLETOS + 1 }, () => boleto.id);
    await expect(reenviarBoletos(autor("DONO"), { ids: muitos }, { resend: caixa })).rejects.toMatchObject({ status: 400 });
    expect(caixa.caixa).toHaveLength(0);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: boleto.id } })).toBe(0);
  });
});
