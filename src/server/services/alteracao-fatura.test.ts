import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { CoraMemoria } from "@/server/cora/memoria";
import { prisma } from "@/server/db";
import { InterMemoria } from "@/server/inter/memoria";
import { clienteResendMemoria } from "@/server/regua/resend";
import { criarClienteTwilioMemoria } from "@/server/twilio/memoria";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { alterarFatura } from "./alteracao-fatura-service";
import { criarCliente } from "./cliente-service";
import { emitirFaturaCora } from "./cora-cobranca";
import { emitirFatura } from "./fatura-service";
import { emitirFaturaInter } from "./inter-cobranca";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ASAAS_MOCK;
delete process.env.TWILIO_MOCK;

usarBancoDeTeste();

const CHAVE_ASAAS = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const CHAVE_RESEND = "re_teste_local_nao_enviar_0001";
const AGORA = new Date("2026-11-13T15:00:00.000Z");

const AMBIENTE = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WEBHOOK_URL",
  "TWILIO_WHATSAPP_TESTE",
  "TWILIO_CONTENT_SID_BOLETO_GERADO",
  "TWILIO_WHATSAPP_SENDER_OFICIAL",
  "TWILIO_WHATSAPP_OFICIAL_DESDE",
  "TWILIO_WHATSAPP_SANDBOX",
  "TWILIO_MOCK",
  "ASAAS_MOCK",
  "CORA_AMBIENTE",
] as const;

const anterior = Object.fromEntries(AMBIENTE.map((chave) => [chave, process.env[chave]]));

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
  delete process.env.TWILIO_MOCK;
  delete process.env.CORA_AMBIENTE;
  process.env.TWILIO_ACCOUNT_SID = `AC${"c".repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = "token-pai-de-teste-0001";
  process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";
  process.env.TWILIO_CONTENT_SID_BOLETO_GERADO = "HXd3e534c278f4db0f03267127c8f8ea42";
  process.env.TWILIO_WHATSAPP_SENDER_OFICIAL = "true";
  process.env.TWILIO_WHATSAPP_OFICIAL_DESDE = "2026-01-01T00:00:00.000Z";
  delete process.env.TWILIO_WHATSAPP_SANDBOX;
});

afterAll(() => {
  for (const chave of AMBIENTE) {
    const valor = anterior[chave];
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
});

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Alteracao", cnpj: completarCnpj("581300000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Vizinha Alteracao", cnpj: completarCnpj("581300000002") })
  ).id;
});

function autor(papel: PapelUsuario = "DONO", id = empresaId) {
  return {
    empresaId: id,
    papel,
    email: `pessoa-${papel.toLowerCase()}@exemplo.test`,
    nomeEmpresa: "Empresa Alteracao",
  };
}

function pessoa(documento: string, email = "cliente.alteracao@exemplo.test") {
  return {
    nomeFantasia: "Costa Verde",
    razaoSocial: "Costa Verde Ltda",
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

async function ligarRegua(modoTeste = false) {
  await salvarConfiguracaoRegua(autor("DONO"), {
    ativa: true,
    modoTeste,
    remetenteNome: "Empresa Alteracao",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE_RESEND,
  });
  const painel = await obterPainelRegua(autor("DONO"));
  const regua = painel.reguas[0];
  if (!regua) throw new Error("Régua padrão ausente.");
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
        assunto: "Boleto atualizado",
        corpo: "Valor {valor} vence {vencimento}. {link}",
        enviarWhatsapp: true,
      },
    ],
  });
}

async function vinculoDe(clienteId: string) {
  const servico = await prisma.servico.create({
    data: { empresaId, nome: `Mensalidade ${clienteId.slice(-4)}`, precoPadrao: "189.90" },
  });
  return prisma.clienteServico.create({
    data: {
      empresaId,
      clienteId,
      servicoId: servico.id,
      valor: "189.90",
      recorrencia: "MENSAL",
      inicioEm: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

describe("alterar boleto do Asaas", () => {
  it("atualiza vencimento, valor e descrição, reenvia e não esbarra na régua", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE_ASAAS });
    await ligarRegua(false);
    const cadastro = await criarCliente(empresaId, pessoa(completarCnpj("581300000003")));
    const vinculo = await vinculoDe(cadastro.id);
    const memoria = new AsaasMemoria("alt");
    const emitida = await emitirFatura(
      autor("FINANCEIRO"),
      cadastro.id,
      {
        valor: "189,90",
        vencimento: "2026-11-15",
        formaCobranca: "BOLETO",
        descricao: "Mensalidade",
        clienteServicoId: vinculo.id,
      },
      memoria,
    );
    const cobranca = memoria.cobrancas.get(emitida.asaasPaymentId);
    if (!cobranca) throw new Error("Cobrança ausente na memória.");
    cobranca.status = "OVERDUE";
    await prisma.fatura.update({ where: { id: emitida.id }, data: { status: "OVERDUE", statusNormalizado: "VENCIDO" } });
    const passo = await prisma.passoRegua.findFirstOrThrow({ where: { empresaId, naEmissao: true } });
    await prisma.lembreteRegua.create({
      data: {
        empresaId,
        faturaId: emitida.id,
        passoId: passo.id,
        clienteId: cadastro.id,
        canal: "EMAIL",
        status: "ENVIADO",
        automatico: true,
        modoTeste: false,
        rotulo: "Na emissão",
      },
    });

    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const linhaAntes = emitida.linhaDigitavel;
    const urlAntes = emitida.boletoUrl;
    await expect(
      alterarFatura(autor("SUPORTE"), emitida.id, { valor: "210,00", vencimento: "2026-12-20", descricao: "Revista" }, { asaas: memoria }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      alterarFatura(
        autor("DONO", outraEmpresaId),
        emitida.id,
        { valor: "210,00", vencimento: "2026-12-20", descricao: "Revista" },
        { asaas: memoria },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(memoria.atualizacoes).toBe(0);

    const resultado = await alterarFatura(
      autor("FINANCEIRO"),
      emitida.id,
      { valor: "210,00", vencimento: "2026-12-20", descricao: "Revista" },
      { asaas: memoria, resend: caixa, twilio, agora: AGORA },
    );
    expect(resultado.reemitido).toBe(false);
    expect(resultado.fatura.valor).toBe("210.00");
    expect(resultado.fatura.vencimento).toBe("2026-12-20");
    expect(resultado.fatura.descricao).toBe("Revista");
    expect(resultado.fatura.status).toBe("PENDING");
    expect(resultado.fatura.asaasPaymentId).toBe(emitida.asaasPaymentId);
    expect(resultado.fatura.clienteServicoId).toBe(vinculo.id);
    expect(resultado.fatura.linhaDigitavel).toBeTruthy();
    expect(resultado.fatura.linhaDigitavel).not.toBe(linhaAntes);
    expect(resultado.fatura.boletoUrl).not.toBe(urlAntes);
    expect(resultado.fatura.faturaUrl).toContain("sandbox.asaas.com");
    expect(resultado.reenvio.email.aceitos).toBe(1);
    expect(resultado.reenvio.whatsapp.aceitos).toBe(1);
    expect(caixa.caixa[0]?.para).toBe("cliente.alteracao@exemplo.test");
    expect(caixa.caixa[0]?.texto).toContain("R$ 210,00");
    expect(caixa.caixa[0]?.texto).toContain("20/12/2026");
    expect(caixa.caixa[0]?.texto).toContain(resultado.fatura.linhaDigitavel ?? "");
    expect(twilio.enviados).toHaveLength(1);
    expect(twilio.enviados[0]?.para).toBe("whatsapp:+5513988881001");
    expect(twilio.enviados[0]?.variaveis["2"]).toContain("210,00");
    expect(JSON.stringify(resultado)).not.toContain(CHAVE_ASAAS);
    expect(JSON.stringify(resultado)).not.toContain(CHAVE_RESEND);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: emitida.id, automatico: true, status: "ENVIADO" } })).toBe(1);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: emitida.id, automatico: false, status: "ENVIADO" } })).toBe(1);

    const deNovo = await alterarFatura(
      autor("DONO"),
      emitida.id,
      { valor: "210,00", vencimento: "2026-12-20", descricao: "Revista de novo" },
      { asaas: memoria, resend: caixa, twilio, agora: AGORA },
    );
    expect(deNovo.fatura.descricao).toBe("Revista de novo");
    expect(twilio.enviados).toHaveLength(2);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: emitida.id } })).toBe(2);
    const chaves = await prisma.filaWhatsapp.findMany({ where: { faturaId: emitida.id }, select: { chaveIdempotencia: true } });
    expect(new Set(chaves.map((item) => item.chaveIdempotencia)).size).toBe(2);
    expect(memoria.cobrancas.size).toBe(1);
  });

  it("recusa pagamento, cancelada, payload igual e segue se um canal não puder enviar", async () => {
    await salvarConfiguracaoAsaas(autor("DONO"), { ambiente: "SANDBOX", chaveApi: CHAVE_ASAAS });
    await ligarRegua(false);
    const memoria = new AsaasMemoria("guarda");
    const cadastro = await criarCliente(empresaId, pessoa(completarCnpj("581300000004"), "sem.email.alteracao@exemplo.test"));
    const emitida = await emitirFatura(
      autor("DONO"),
      cadastro.id,
      { valor: "80,00", vencimento: "2026-11-20", formaCobranca: "BOLETO", descricao: "Avulsa" },
      memoria,
    );
    await expect(
      alterarFatura(autor("DONO"), emitida.id, { valor: "80,00", vencimento: "2026-11-20", descricao: "Avulsa" }, { asaas: memoria }),
    ).rejects.toMatchObject({ status: 400, codigo: "sem_alteracao" });
    await prisma.fatura.update({ where: { id: emitida.id }, data: { status: "RECEIVED", statusNormalizado: "PAGO" } });
    await expect(
      alterarFatura(autor("DONO"), emitida.id, { valor: "90,00", vencimento: "2026-12-01", descricao: "Avulsa" }, { asaas: memoria }),
    ).rejects.toMatchObject({ status: 422, codigo: "fatura_fechada" });
    expect(memoria.atualizacoes).toBe(0);

    const semEmail = await criarCliente(empresaId, pessoa(completarCnpj("581300000005"), "tem.email.alteracao@exemplo.test"));
    await prisma.cliente.update({ where: { id: semEmail.id }, data: { email: "" } });
    const boleto = await emitirFatura(
      autor("DONO"),
      semEmail.id,
      { valor: "70,00", vencimento: "2026-11-22", formaCobranca: "BOLETO", descricao: "Sem e-mail" },
      memoria,
    );
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const parcial = await alterarFatura(
      autor("DONO"),
      boleto.id,
      { valor: "75,00", vencimento: "2026-11-22", descricao: "Sem e-mail" },
      { asaas: memoria, resend: caixa, twilio, agora: AGORA },
    );
    expect(parcial.fatura.valor).toBe("75.00");
    expect(parcial.reenvio.email.ignorados).toBe(1);
    expect(parcial.reenvio.whatsapp.aceitos).toBe(1);
    expect(caixa.caixa).toHaveLength(0);

    await prisma.optOutWhatsapp.create({
      data: { empresaId, telefone: "5513988881001", ativo: true, origem: "teste" },
    });
    const comEmail = await criarCliente(empresaId, pessoa(completarCnpj("581300000006"), "opt.alteracao@exemplo.test"));
    const opt = await emitirFatura(
      autor("DONO"),
      comEmail.id,
      { valor: "60,00", vencimento: "2026-11-25", formaCobranca: "BOLETO", descricao: "Opt-out" },
      memoria,
    );
    const caixaOpt = clienteResendMemoria();
    const twilioOpt = criarClienteTwilioMemoria();
    const optOut = await alterarFatura(
      autor("DONO"),
      opt.id,
      { valor: "65,00", vencimento: "2026-11-25", descricao: "Opt-out" },
      { asaas: memoria, resend: caixaOpt, twilio: twilioOpt, agora: AGORA },
    );
    expect(optOut.fatura.valor).toBe("65.00");
    expect(optOut.reenvio.email.aceitos).toBe(1);
    expect(optOut.reenvio.whatsapp.ignorados).toBe(1);
    expect(optOut.reenvio.whatsapp && optOut.reenvio.itens[0]?.canais.find((canal) => canal.canal === "WHATSAPP")?.motivo).toMatch(/opt-out/i);
    expect(twilioOpt.enviados).toHaveLength(0);
    expect(caixaOpt.caixa[0]?.para).toBe("opt.alteracao@exemplo.test");
  });
});

describe("alterar boleto da Cora", () => {
  async function clienteCora(raiz: string) {
    await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: "CORA" } });
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Cliente Cora",
        razaoSocial: "Cliente Cora Ltda",
        documento: completarCnpj(raiz),
        tipoDocumento: "CNPJ",
        segmento: "OUTRO",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: `cora-${raiz}@exemplo.test`,
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
        enderecoCobranca: "Rua A",
        numeroCobranca: "10",
        bairroCobranca: "Centro",
        cepCobranca: "11010000",
      },
    });
    const servico = await prisma.servico.create({
      data: { empresaId, nome: `Cora ${raiz}`, precoPadrao: "30.00" },
    });
    const vinculo = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        servicoId: servico.id,
        valor: "30.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    return { cliente, vinculo };
  }

  it("cancela o boleto atual, emite outro e mantém o vínculo", async () => {
    await ligarRegua(false);
    const { cliente, vinculo } = await clienteCora("581300000011");
    const memoria = new CoraMemoria();
    const emitida = await emitirFaturaCora(
      autor("DONO"),
      cliente.id,
      { valor: "30.00", vencimento: "2026-12-01", descricao: "Original", clienteServicoId: vinculo.id, chaveIdempotencia: "cora-alterar-0001" },
      memoria,
    );
    const idAntigo = (await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } })).idExterno;
    const caixa = clienteResendMemoria();
    const twilio = criarClienteTwilioMemoria();
    const resultado = await alterarFatura(
      autor("FINANCEIRO"),
      emitida.id,
      { valor: "45.00", vencimento: "2026-12-20", descricao: "Reemitida" },
      { cora: memoria, resend: caixa, twilio, agora: AGORA },
    );
    expect(resultado.reemitido).toBe(true);
    expect(resultado.fatura.id).toBe(emitida.id);
    expect(resultado.fatura.clienteServicoId).toBe(vinculo.id);
    expect(resultado.fatura.valor).toBe("45.00");
    expect(resultado.fatura.vencimento).toBe("2026-12-20");
    expect(resultado.fatura.descricao).toBe("Reemitida");
    expect(resultado.fatura.status).toBe("OPEN");
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } });
    expect(gravada.idExterno).toBeTruthy();
    expect(gravada.idExterno).not.toBe(idAntigo);
    expect(gravada.provedor).toBe("CORA");
    expect(gravada.clienteServicoId).toBe(vinculo.id);
    expect(gravada.erroEmissao).toBeNull();
    expect(memoria.faturas.get(idAntigo ?? "")?.status).toBe("CANCELLED");
    expect(memoria.faturas.get(gravada.idExterno ?? "")?.status).toBe("OPEN");
    expect(resultado.fatura.linhaDigitavel).toBeTruthy();
    expect(resultado.fatura.linhaDigitavel).not.toBe(emitida.linhaDigitavel);
    expect(resultado.fatura.pixCopiaCola).not.toBe(emitida.pixCopiaCola);
    expect(resultado.reenvio.email.aceitos).toBe(1);
    expect(caixa.caixa[0]?.texto).toContain(resultado.fatura.linhaDigitavel ?? "");
    expect(process.env.CORA_AMBIENTE ?? "").not.toBe("producao");
  });

  it("não deixa código antigo se a reemissão falha e o retry usa a mesma chave", async () => {
    const { cliente, vinculo } = await clienteCora("581300000012");
    const memoria = new CoraMemoria();
    const emitida = await emitirFaturaCora(
      autor("DONO"),
      cliente.id,
      { valor: "30.00", vencimento: "2026-12-01", descricao: "Original", clienteServicoId: vinculo.id, chaveIdempotencia: "cora-alterar-0002" },
      memoria,
    );
    const idAntigo = (await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } })).idExterno;
    const linha = emitida.linhaDigitavel;
    memoria.falharCriacao = true;
    const caixa = clienteResendMemoria();
    await expect(
      alterarFatura(
        autor("DONO"),
        emitida.id,
        { valor: "45.00", vencimento: "2026-12-20", descricao: "Reemitida" },
        { cora: memoria, resend: caixa, agora: AGORA },
      ),
    ).rejects.toMatchObject({ codigo: "cora_reemissao" });
    const pendente = await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } });
    expect(pendente.status).toBe("OPEN");
    expect(pendente.idExterno).toBe(idAntigo);
    expect(pendente.linhaDigitavel).toBeNull();
    expect(pendente.boletoUrl).toBeNull();
    expect(pendente.pixCopiaCola).toBeNull();
    expect(pendente.erroEmissao).toMatch(/Salve de novo/);
    expect(pendente.clienteServicoId).toBe(vinculo.id);
    expect(pendente.idempotencyKeyCora).toBeTruthy();
    expect(memoria.faturas.get(idAntigo ?? "")?.status).toBe("CANCELLED");
    expect(memoria.faturas.size).toBe(1);
    expect(caixa.caixa).toHaveLength(0);

    memoria.falharCriacao = false;
    const chave = pendente.idempotencyKeyCora;
    const retomada = await alterarFatura(
      autor("DONO"),
      emitida.id,
      { valor: "45.00", vencimento: "2026-12-20", descricao: "Reemitida" },
      { cora: memoria, agora: AGORA },
    );
    expect(retomada.fatura.valor).toBe("45.00");
    expect(retomada.fatura.linhaDigitavel).toBeTruthy();
    expect(retomada.fatura.linhaDigitavel).not.toBe(linha);
    expect(memoria.faturas.size).toBe(2);
    const idNovo = (await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } })).idExterno;
    expect(memoria.chaves.get(chave ?? "")).toBe(idNovo);
    const final = await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } });
    expect(final.clienteServicoId).toBe(vinculo.id);
    expect(final.erroEmissao).toBeNull();
  });

  it("não mexe na fatura se a Cora recusa o cancelamento ou o pagador está incompleto", async () => {
    const { cliente } = await clienteCora("581300000013");
    const memoria = new CoraMemoria();
    const emitida = await emitirFaturaCora(
      autor("DONO"),
      cliente.id,
      { valor: "30.00", vencimento: "2026-12-01", descricao: "Original", chaveIdempotencia: "cora-alterar-0003" },
      memoria,
    );
    const idAntigo = (await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } })).idExterno;
    memoria.falharCancelamento = true;
    await expect(
      alterarFatura(autor("DONO"), emitida.id, { valor: "45.00", vencimento: "2026-12-20", descricao: "Original" }, { cora: memoria }),
    ).rejects.toMatchObject({ status: 504 });
    const intacta = await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } });
    expect(intacta.linhaDigitavel).toBe(emitida.linhaDigitavel);
    expect(intacta.idExterno).toBe(idAntigo);
    expect(intacta.erroEmissao).toBeNull();
    expect(memoria.faturas.get(idAntigo ?? "")?.status).toBe("OPEN");

    memoria.falharCancelamento = false;
    await prisma.cliente.update({ where: { id: cliente.id }, data: { enderecoCobranca: "" } });
    await expect(
      alterarFatura(autor("DONO"), emitida.id, { valor: "45.00", vencimento: "2026-12-20", descricao: "Original" }, { cora: memoria }),
    ).rejects.toMatchObject({ codigo: "pagador_incompleto" });
    expect(memoria.faturas.get(idAntigo ?? "")?.status).toBe("OPEN");
  });
});

describe("alterar boleto do Inter e dos demais", () => {
  it("atualiza valor e vencimento no Inter e guarda a descrição só no Taguaro", async () => {
    await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: "INTER" } });
    await ligarRegua(false);
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Cliente Inter",
        razaoSocial: "Cliente Inter Ltda",
        documento: completarCnpj("581300000021"),
        tipoDocumento: "CNPJ",
        segmento: "OUTRO",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: "inter.alteracao@exemplo.test",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
        enderecoCobranca: "Rua B",
        numeroCobranca: "20",
        bairroCobranca: "Centro",
        cepCobranca: "11010000",
      },
    });
    const servico = await prisma.servico.create({
      data: { empresaId, nome: "Inter mensal", precoPadrao: "25.00" },
    });
    const vinculo = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        servicoId: servico.id,
        valor: "25.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    const memoria = new InterMemoria();
    const emitida = await emitirFaturaInter(
      autor("DONO"),
      cliente.id,
      { valor: "25.00", vencimento: "2026-12-01", descricao: "Original", clienteServicoId: vinculo.id, chaveIdempotencia: "inter-alterar-0001" },
      memoria,
    );
    const caixa = clienteResendMemoria();
    const resultado = await alterarFatura(
      autor("DONO"),
      emitida.id,
      { valor: "40.00", vencimento: "2026-12-18", descricao: "Ajustada" },
      { inter: memoria, resend: caixa, agora: AGORA },
    );
    expect(resultado.reemitido).toBe(false);
    expect(resultado.fatura.valor).toBe("40.00");
    expect(resultado.fatura.vencimento).toBe("2026-12-18");
    expect(resultado.fatura.descricao).toBe("Ajustada");
    expect(resultado.fatura.clienteServicoId).toBe(vinculo.id);
    const idExterno = (await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } })).idExterno;
    expect(idExterno).toBe(memoria.cobrancas[0]?.codigoSolicitacao);
    expect(resultado.fatura.linhaDigitavel).not.toBe(emitida.linhaDigitavel);
    expect(memoria.cobrancas).toHaveLength(1);
    expect(memoria.cobrancas[0]?.valorNominal).toBe("40.00");
    expect(resultado.reenvio.email.aceitos).toBe(1);

    const soTexto = await alterarFatura(
      autor("DONO"),
      emitida.id,
      { valor: "40.00", vencimento: "2026-12-18", descricao: "Só o texto" },
      { inter: memoria, resend: clienteResendMemoria(), twilio: criarClienteTwilioMemoria(), agora: AGORA },
    );
    expect(soTexto.fatura.descricao).toBe("Só o texto");
    expect(soTexto.fatura.linhaDigitavel).toBe(resultado.fatura.linhaDigitavel);
    expect(memoria.cobrancas).toHaveLength(1);
  });

  it("recusa protesto no Inter e provedor sem alteração", async () => {
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Cliente",
        razaoSocial: "Cliente Ltda",
        documento: completarCnpj("581300000022"),
        tipoDocumento: "CNPJ",
        segmento: "OUTRO",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: "guarda.alteracao@exemplo.test",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
      },
    });
    const protesto = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        provedor: "INTER",
        idExterno: "inter-protesto",
        valor: "10.00",
        vencimento: new Date("2026-10-01T00:00:00.000Z"),
        status: "PROTESTO",
        statusNormalizado: "VENCIDO",
        formaCobranca: "BOLETO",
        boletoUrl: "https://taguaro.test/boleto",
      },
    });
    await expect(
      alterarFatura(autor("DONO"), protesto.id, { valor: "12.00", vencimento: "2026-12-01", descricao: "Não" }),
    ).rejects.toMatchObject({ status: 422, codigo: "fatura_fechada" });

    const efi = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        provedor: "EFI",
        valor: "10.00",
        vencimento: new Date("2026-12-01T00:00:00.000Z"),
        status: "PENDING",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });
    await expect(
      alterarFatura(autor("DONO"), efi.id, { valor: "12.00", vencimento: "2026-12-02", descricao: "Não" }),
    ).rejects.toMatchObject({ status: 422, codigo: "provedor_sem_alteracao" });
  });
});
