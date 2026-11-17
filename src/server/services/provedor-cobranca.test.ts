import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dataHojeIso, proximoVencimentoIso } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { alterarFatura } from "./alteracao-fatura-service";
import { cancelarFatura } from "./fatura-service";
import { ativarRecorrencia, cancelarRecorrencia } from "./recorrencia-service";
import { criarServico } from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { sincronizarVisualizacoesDoAutor } from "./visualizacao-fatura-service";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";

let empresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
  delete process.env.TWILIO_MOCK;
});

beforeEach(async () => {
  delete process.env.ASAAS_MOCK;
  delete process.env.TWILIO_MOCK;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Collab Software", cnpj: completarCnpj("910000000001") })).id;
});

function autor(id = empresaId) {
  return { empresaId: id, papel: "DONO" as const, email: "dono@exemplo.test", nomeEmpresa: "Collab Software" };
}

async function cliente() {
  return criarCliente(empresaId, {
    nomeFantasia: "Costa Verde Exemplo",
    razaoSocial: "Costa Verde Exemplo Ltda",
    documento: completarCnpj("910000000002"),
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  });
}

async function virarPix() {
  await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: "PIX_DIRETO" } });
}

describe("provedor da cobrança, não o da empresa", () => {
  it("cancela, altera e sincroniza fatura Asaas quando a empresa está no Pix", async () => {
    await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cadastro = await cliente();
    const memoria = new AsaasMemoria("pix");
    const customer = await memoria.criarCliente({ nome: "Costa Verde", cpfCnpj: "910000000002" });
    const cobranca = await memoria.criarCobranca({
      customer: customer.id,
      formaCobranca: "BOLETO",
      valor: "80.00",
      vencimento: "2026-12-15",
      referencia: "fatura-asaas",
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cadastro.id,
        asaasPaymentId: cobranca.id,
        valor: "80.00",
        vencimento: new Date("2026-12-15T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "BOLETO",
        provedor: "ASAAS",
        descricao: "Mensalidade",
      },
    });
    await virarPix();

    const alterada = await alterarFatura(
      autor(),
      fatura.id,
      { valor: "90.00", vencimento: "2026-12-20", descricao: "Mensalidade ajustada" },
      { asaas: memoria },
    );
    expect(alterada.fatura.valor).toBe("90.00");
    expect(memoria.cobrancas.get(cobranca.id)?.valor).toBe("90.00");
    expect(memoria.cobrancas.get(cobranca.id)?.excluida).toBe(false);

    const vista = await sincronizarVisualizacoesDoAutor(autor(), {
      http: memoria,
      agora: new Date("2026-12-01T12:00:00.000Z"),
    });
    expect(vista.consultadas).toBe(1);
    expect(vista.falhas).toBe(0);

    const cancelada = await cancelarFatura(autor(), fatura.id, memoria);
    expect(cancelada.excluida).toBe(true);
    expect(memoria.cobrancas.get(cobranca.id)?.excluida).toBe(true);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).provedorPagamento).toBe("PIX_DIRETO");
  });

  it("diz que o Asaas não está configurado, sem afirmar que a empresa continua no Asaas", async () => {
    const cadastro = await cliente();
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cadastro.id,
        asaasPaymentId: "pay_sem_config",
        valor: "10.00",
        vencimento: new Date("2026-12-15T00:00:00.000Z"),
        status: "PENDING",
        formaCobranca: "BOLETO",
        provedor: "ASAAS",
      },
    });
    await virarPix();
    await expect(cancelarFatura(autor(), fatura.id, new AsaasMemoria("sem"))).rejects.toMatchObject({
      status: 409,
      codigo: "asaas_nao_configurado",
      message: "Esta fatura é do Asaas, mas a empresa não tem o Asaas configurado.",
    });
  });

  it("cancela cobrança Pix direto só no Taguaro", async () => {
    const cadastro = await cliente();
    await virarPix();
    const fatura = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId: cadastro.id,
        valor: "40.00",
        vencimento: new Date("2026-12-01T00:00:00.000Z"),
        status: "EM_ABERTO",
        formaCobranca: "PIX",
        provedor: "PIX_DIRETO",
        pixCopiaCola: "00020126580014br.gov.bcb.pix",
        asaasPaymentId: null,
      },
    });
    const memoria = new AsaasMemoria("local");
    const cancelada = await cancelarFatura(autor(), fatura.id, memoria);
    expect(cancelada.excluida).toBe(true);
    expect(cancelada.status).toBe("CANCELADA");
    expect(memoria.cobrancas.size).toBe(0);
    expect(memoria.assinaturas.size).toBe(0);
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(gravada.provedor).toBe("PIX_DIRETO");
    expect(gravada.statusNormalizado).toBe("CANCELADO");
  });

  it("cancela assinatura Asaas antiga com a empresa no Pix", async () => {
    await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const servico = await criarServico(autor(), { nome: "Suporte", precoPadrao: "150,00", ativo: true });
    const cadastro = await cliente();
    const vinculo = await criarServicoDoCliente(autor(), cadastro.id, {
      servicoId: servico.id,
      valor: "150,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-01",
      status: "ATIVO",
    });
    const memoria = new AsaasMemoria("sub");
    const vencimento = proximoVencimentoIso(10, dataHojeIso());
    const ativada = await ativarRecorrencia(
      autor(),
      vinculo.id,
      { diaVencimento: 10, formaCobranca: "BOLETO", valor: "150,00", descricao: "Mensalidade", proximoVencimento: vencimento },
      memoria,
    );
    expect(ativada.recorrenciaAsaas?.status).toBe("ACTIVE");
    const linha = await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } });
    expect(linha.asaasSubscriptionId).toBeTruthy();

    await virarPix();
    const cancelada = await cancelarRecorrencia(autor(), vinculo.id, memoria);
    expect(cancelada.recorrenciaAsaas?.status).toBe("CANCELADA");
    expect(memoria.assinaturas.get(linha.asaasSubscriptionId!)?.excluida).toBe(true);
  });
});
