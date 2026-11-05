import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { criarClienteEvolutionMemoria } from "@/server/evolution/memoria";
import { ErroAplicacao } from "@/server/erros";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { nomeInstanciaDaEmpresa } from "@/server/whatsapp/selecao";
import { criarCliente } from "./cliente-service";
import {
  atualizarStatusEvolution,
  conectarEvolution,
  desconectarEvolution,
  escolherProvedorWhatsapp,
  obterCanalDaEmpresa,
} from "./evolution-service";
import { processarWebhookEvolution } from "./evolution-webhook-service";
import { executarRegua } from "./regua-job";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
process.env.TWILIO_WHATSAPP_TESTE = "11999990000";
delete process.env.TWILIO_MOCK;

const SEGREDO = "segredo-evolution-teste-0001";
const CHAVE = "chave-evolution-nao-mostrar";
const AGORA = new Date("2026-10-26T15:00:00.000Z");
const fetchSpy = vi.fn(() => Promise.reject(new Error("rede proibida no teste")));

usarBancoDeTeste();

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  process.env.EVOLUTION_WHATSAPP_ENABLED = "true";
  process.env.EVOLUTION_API_KEY = CHAVE;
  process.env.EVOLUTION_WEBHOOK_SECRET = SEGREDO;
  process.env.EVOLUTION_WEBHOOK_URL = "https://taguaro.test/api/webhooks/evolution";
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa QR", cnpj: completarCnpj("594000000001") })).id;
  outraEmpresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra Empresa", cnpj: completarCnpj("594000000002") })).id;
  await prisma.usuario.create({
    data: {
      nome: "Dono QR",
      email: `dono-${empresaId}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId,
      papel: "DONO",
    },
  });
});

afterEach(() => {
  delete process.env.EVOLUTION_WHATSAPP_ENABLED;
  delete process.env.EVOLUTION_API_KEY;
  delete process.env.EVOLUTION_WEBHOOK_SECRET;
  delete process.env.EVOLUTION_WEBHOOK_URL;
});

function autor(papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO", id = empresaId) {
  return { empresaId: id, papel, email: `pessoa-${id}@exemplo.test`, nomeEmpresa: "Empresa QR" };
}

async function ligar(id = empresaId) {
  return salvarConfiguracaoRegua(autor("DONO", id), {
    ativa: true,
    modoTeste: true,
    remetenteNome: "Empresa QR",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "",
    chaveResend: "re_teste_local_nao_enviar_0001",
  });
}

async function passoComWhatsapp(id = empresaId) {
  const painel = await obterPainelRegua(autor("DONO", id));
  const regua = painel.reguas[0];
  return atualizarRegua(autor("DONO", id), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: [
      {
        id: regua.passos[0]?.id,
        naEmissao: false,
        dias: 0,
        canal: "EMAIL",
        assunto: "Sua cobrança",
        corpo: "Olá, {cliente}. {link}",
        enviarWhatsapp: true,
      },
    ],
  });
}

async function abrirFatura(idEmpresa: string, clienteId: string) {
  return prisma.fatura.create({
    data: {
      empresaId: idEmpresa,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "150.00",
      vencimento: new Date("2026-10-26T00:00:00.000Z"),
      status: "PENDING",
      formaCobranca: "BOLETO",
      boletoUrl: "https://www.asaas.com/i/exemplo-boleto",
      descricao: "Serviço exemplo",
      criadoEm: new Date("2026-10-26T15:00:00.000Z"),
    },
  });
}

describe("WhatsApp por Evolution", () => {
  it("não apaga colunas asaas nem o índice parcial, e liga o RLS nas tabelas novas e de pagamento", async () => {
    const evolution = readFileSync("prisma/migrations/20261105150000_evolution_whatsapp/migration.sql", "utf8");
    const rls = readFileSync("prisma/migrations/20261105151000_rls_credenciais_pagamento/migration.sql", "utf8");
    expect(evolution).not.toMatch(/drop\s+/i);
    expect(rls).not.toMatch(/drop\s+/i);
    expect(`${evolution}\n${rls}`).not.toMatch(/alter\s+table\s+"faturas"/i);
    const indice = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'faturas_criando_por_cliente'
    `;
    expect(indice[0]?.indexdef).toContain("CRIANDO");
    const tabelas = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'configuracoes_canal_whatsapp',
          'alertas_empresa',
          'limites_tentativa',
          'configuracoes_pagamento',
          'eventos_pagamento'
        )
    `;
    expect(tabelas).toHaveLength(5);
    expect(tabelas.every((linha) => linha.relrowsecurity)).toBe(true);
    const politicas = await prisma.$queryRaw<{ policyname: string; roles: string[] }[]>`
      SELECT policyname, roles::text[] AS roles
      FROM pg_policies
      WHERE tablename IN (
        'configuracoes_pagamento',
        'eventos_pagamento',
        'configuracoes_canal_whatsapp'
      )
    `;
    expect(politicas.length).toBeGreaterThan(0);
    expect(politicas.every((linha) => linha.policyname === "taguaro_app_acesso")).toBe(true);
    expect(politicas.every((linha) => linha.roles.includes("taguaro_app"))).toBe(true);
  });

  it("nega financeiro, suporte e a empresa vizinha, e não devolve segredo nem QR inseguro", async () => {
    const evolution = criarClienteEvolutionMemoria();
    await expect(conectarEvolution(autor("FINANCEIRO"), { evolution })).rejects.toMatchObject({ status: 403 });
    await expect(conectarEvolution(autor("SUPORTE"), { evolution })).rejects.toMatchObject({ status: 403 });
    const canal = await conectarEvolution(autor(), { evolution });
    expect(canal.qrCode?.startsWith("data:image/png;base64,")).toBe(true);
    expect(JSON.stringify(canal)).not.toContain(SEGREDO);
    expect(JSON.stringify(canal)).not.toContain(CHAVE);
    const vizinha = await obterCanalDaEmpresa(outraEmpresaId);
    expect(vizinha.provedor).toBe("TWILIO");
    expect(vizinha.status).toBe("AUSENTE");
    expect(vizinha.qrCode).toBeNull();
    await escolherProvedorWhatsapp(autor("DONO", outraEmpresaId), { provedor: "TWILIO" });
    const daqui = await obterCanalDaEmpresa(empresaId);
    expect(daqui.provedor).toBe("EVOLUTION");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(evolution.chamouRede).toBe(false);
  });

  it("envia pela Evolution no modo teste, uma vez, e segura a fila se desconectar", async () => {
    const evolution = criarClienteEvolutionMemoria();
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await conectarEvolution(autor(), { evolution });
    const nome = nomeInstanciaDaEmpresa(empresaId);
    evolution.simular(nome, "CONECTADO");
    await atualizarStatusEvolution(autor(), { evolution });
    await passoComWhatsapp();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente da Régua",
      razaoSocial: "Cliente da Régua Ltda",
      documento: completarCnpj("594000000003"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881001",
      email: "cliente.regua@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(empresaId, cliente.id);
    const primeiro = await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(primeiro.whatsappEnviados).toBe(1);
    expect(evolution.enviados).toHaveLength(1);
    expect(evolution.enviados[0]?.numero).toBe("5511999990000");
    expect(evolution.enviados[0]?.numero).not.toContain("13988881001");
    expect(evolution.enviados[0]?.texto).toContain("Cliente da Régua");
    expect(twilio.enviados).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(evolution.enviados).toHaveLength(1);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId } })).toBe(1);

    await desconectarEvolution(autor(), { evolution });
    const outro = await criarCliente(empresaId, {
      nomeFantasia: "Cliente Desconectado",
      razaoSocial: "Cliente Desconectado Ltda",
      documento: completarCnpj("594000000004"),
      segmento: "OUTRO",
      contatoNome: "Bia",
      whatsapp: "13988881002",
      email: "outro.regua@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(empresaId, outro.id);
    const retido = await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(retido.whatsappEnviados).toBe(0);
    expect(evolution.enviados).toHaveLength(1);
    const fila = await prisma.filaWhatsapp.findFirstOrThrow({ where: { clienteId: outro.id } });
    expect(fila.status).toBe("PENDENTE");
    expect(fila.motivo).toBe("WhatsApp desconectado");
    const alerta = await prisma.alertaEmpresa.findUniqueOrThrow({
      where: { empresaId_codigo: { empresaId, codigo: "WHATSAPP_DESCONECTADO" } },
    });
    expect(alerta.lido).toBe(false);
    await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(await prisma.filaWhatsapp.count({ where: { clienteId: outro.id } })).toBe(1);
  });

  it("sem a flag a empresa que escolheu QR Code continua na Twilio", async () => {
    delete process.env.EVOLUTION_WHATSAPP_ENABLED;
    const evolution = criarClienteEvolutionMemoria();
    const twilio = criarClienteTwilioMemoria();
    await prisma.configuracaoCanalWhatsapp.create({
      data: {
        empresaId,
        provedor: "EVOLUTION",
        instanceName: nomeInstanciaDaEmpresa(empresaId),
        statusConexao: "CONECTADO",
      },
    });
    await ligar();
    const { conectarTwilio } = await import("./twilio-service");
    await conectarTwilio(autor(), {
      telefone: "11988887777",
      nomeExibicao: "Empresa QR",
      wabaId: "",
      coexistencia: false,
    }, { twilio });
    await passoComWhatsapp();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente Twilio",
      razaoSocial: "Cliente Twilio Ltda",
      documento: completarCnpj("594000000005"),
      segmento: "OUTRO",
      contatoNome: "Caio",
      whatsapp: "13988881001",
      email: "twilio.regua@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await abrirFatura(empresaId, cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(resultado.whatsappEnviados).toBe(1);
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5511999990000");
    expect(evolution.enviados).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recusa webhook sem segredo, ignora instância alheia e não repete o status", async () => {
    const evolution = criarClienteEvolutionMemoria();
    await conectarEvolution(autor(), { evolution });
    await conectarEvolution(autor("DONO", outraEmpresaId), { evolution });
    const nome = nomeInstanciaDaEmpresa(empresaId);
    const outroNome = nomeInstanciaDaEmpresa(outraEmpresaId);
    await expect(processarWebhookEvolution({
      segredo: "segredo-errado-com-tamanho-00",
      corpo: { event: "connection.update", instance: nome, data: { state: "close" } },
      ip: "198.51.100.30",
    })).rejects.toMatchObject({ status: 403 });

    const aberto = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: {
        event: "connection.update",
        instance: nome,
        date_time: "2026-11-05T15:10:00.000Z",
        empresaId: outraEmpresaId,
        apikey: CHAVE,
        data: { state: "open", wuid: "5511988887777@s.whatsapp.net" },
      },
      ip: "198.51.100.31",
    });
    expect(aberto).toMatchObject({ recebido: true, ignorado: false });
    expect((await prisma.configuracaoCanalWhatsapp.findUniqueOrThrow({ where: { empresaId } })).statusConexao).toBe("CONECTADO");
    expect((await prisma.configuracaoCanalWhatsapp.findUniqueOrThrow({ where: { empresaId: outraEmpresaId } })).statusConexao).toBe("CONECTANDO");
    expect(JSON.stringify(await obterCanalDaEmpresa(empresaId))).not.toContain(CHAVE);

    const antigo = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: {
        event: "connection.update",
        instance: nome,
        date_time: "2026-11-05T15:00:00.000Z",
        data: { state: "close" },
      },
      ip: "198.51.100.31",
    });
    expect(antigo).toMatchObject({ ignorado: true });
    expect((await prisma.configuracaoCanalWhatsapp.findUniqueOrThrow({ where: { empresaId } })).statusConexao).toBe("CONECTADO");

    const semData = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: { event: "connection.update", instance: nome, data: { state: "close" } },
      ip: "198.51.100.31",
    });
    expect(semData).toMatchObject({ ignorado: true });

    await prisma.filaWhatsapp.create({
      data: {
        empresaId,
        faturaId: (await abrirFatura(empresaId, (await criarCliente(empresaId, {
          nomeFantasia: "Cliente Evento",
          razaoSocial: "Cliente Evento Ltda",
          documento: completarCnpj("594000000006"),
          segmento: "OUTRO",
          contatoNome: "Davi",
          whatsapp: "13988881009",
          email: "evento.regua@exemplo.test",
          cidade: "Santos",
          uf: "SP",
          status: "ATIVO",
        })).id)).id,
        clienteId: (await prisma.cliente.findFirstOrThrow({ where: { empresaId, nomeFantasia: "Cliente Evento" } })).id,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: `wa:${empresaId}:evento`,
        status: "ENVIADO",
        messageSid: "3EB0ABCDEF12",
        disponivelEm: AGORA,
        modoTeste: true,
        rotulo: "teste",
        variaveis: "{}",
      },
    });
    const status = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: {
        event: "messages.update",
        instance: outroNome,
        data: { keyId: "3EB0ABCDEF12", status: "ERROR" },
      },
      ip: "198.51.100.32",
    });
    expect(status).toMatchObject({ recebido: true });
    expect((await prisma.filaWhatsapp.findFirstOrThrow({ where: { messageSid: "3EB0ABCDEF12" } })).status).toBe("ENVIADO");

    const falha = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: { event: "messages.update", instance: nome, data: { key: { id: "3EB0ABCDEF12" }, status: "ERROR" } },
      ip: "198.51.100.32",
    });
    expect(falha).toMatchObject({ duplicado: false });
    expect((await prisma.filaWhatsapp.findFirstOrThrow({ where: { messageSid: "3EB0ABCDEF12" } })).status).toBe("FALHOU");
    const repetido = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: { event: "messages.update", instance: nome, data: { key: { id: "3EB0ABCDEF12" }, status: "ERROR" } },
      ip: "198.51.100.32",
    });
    expect(repetido).toMatchObject({ duplicado: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não envia cobrança com opt-out e grava PARAR vindo da Evolution sem responder", async () => {
    const evolution = criarClienteEvolutionMemoria();
    const twilio = criarClienteTwilioMemoria();
    await ligar();
    await prisma.configuracaoRegua.update({ where: { empresaId }, data: { modoTeste: false } });
    await conectarEvolution(autor(), { evolution });
    evolution.simular(nomeInstanciaDaEmpresa(empresaId), "CONECTADO");
    await atualizarStatusEvolution(autor(), { evolution });
    await passoComWhatsapp();
    const cliente = await criarCliente(empresaId, {
      nomeFantasia: "Cliente Opt",
      razaoSocial: "Cliente Opt Ltda",
      documento: completarCnpj("594000000007"),
      segmento: "OUTRO",
      contatoNome: "Eva",
      whatsapp: "13988881001",
      email: "opt.regua@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    await prisma.optOutWhatsapp.create({
      data: { empresaId, telefone: "5513988881001", ativo: true, origem: "INBOUND" },
    });
    await abrirFatura(empresaId, cliente.id);
    const resultado = await executarRegua({ agora: AGORA, empresaId, twilio, evolution });
    expect(resultado.whatsappEnviados).toBe(0);
    expect(evolution.enviados).toHaveLength(0);
    const fila = await prisma.filaWhatsapp.findFirstOrThrow({ where: { clienteId: cliente.id } });
    expect(fila.motivo).toBe("opt-out");
    expect(fila.status).toBe("IGNORADO");

    const nome = nomeInstanciaDaEmpresa(empresaId);
    const entrada = await processarWebhookEvolution({
      segredo: SEGREDO,
      corpo: {
        event: "messages.upsert",
        instance: nome,
        data: {
          key: { remoteJid: "5513988881009@s.whatsapp.net", fromMe: false, id: "INBOUNDPARAR0001" },
          message: { conversation: "PARAR" },
        },
      },
      ip: "198.51.100.40",
    });
    expect(entrada).toMatchObject({ ignorado: false });
    const opt = await prisma.optOutWhatsapp.findUniqueOrThrow({
      where: { empresaId_telefone: { empresaId, telefone: "5513988881009" } },
    });
    expect(opt.ativo).toBe(true);
    expect(evolution.enviados).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("limita quem gera QR Code demais", async () => {
    const evolution = criarClienteEvolutionMemoria();
    for (let i = 0; i < 8; i += 1) await conectarEvolution(autor(), { evolution });
    await expect(conectarEvolution(autor(), { evolution })).rejects.toBeInstanceOf(ErroAplicacao);
    await expect(conectarEvolution(autor(), { evolution })).rejects.toMatchObject({ status: 429 });
  });
});
