import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MARCA_COMPROVANTE_TESTE } from "@/server/comprovante/analisar";
import { completarCnpj } from "@/lib/documento";
import { AsaasMemoria } from "@/server/asaas/memoria";
import type { CobrancaAsaas } from "@/server/asaas/contrato";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import {
  confirmarComprovante,
  leituraComprovantesDaEmpresa,
  registrarComprovanteRecebido,
  rejeitarComprovante,
  salvarLeituraComprovantes,
} from "./comprovante-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.ASAAS_MOCK;
delete process.env.TWILIO_MOCK;
process.env.TWILIO_WEBHOOK_URL = "https://taguaro.test/api/webhooks/twilio";

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const AGORA = new Date("2026-11-20T15:00:00.000Z");

function autor(empresaId: string, papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO") {
  return {
    empresaId,
    papel,
    usuarioId: "usuario-comprovante",
    email: "dono@exemplo.test",
    nomeEmpresa: "Collab",
    nome: "Dono",
    cnpjEmpresa: "00000000000191",
    superadministrador: false,
  };
}

function arquivo(extra: Record<string, unknown>) {
  return new Uint8Array(Buffer.from(`${MARCA_COMPROVANTE_TESTE}${JSON.stringify({ parece: true, ...extra })}`));
}

function cobranca(id: string): CobrancaAsaas & {
  encargos: { multaPercentual: null; jurosPercentual: null; descontoPercentual: null; descontoDiasAntes: null };
} {
  return {
    id,
    customer: "cus_comp",
    subscription: null,
    valor: "350.00",
    vencimento: "2026-11-10",
    status: "OVERDUE",
    formaCobranca: "BOLETO",
    boletoUrl: null,
    faturaUrl: null,
    descricao: null,
    excluida: false,
    pagoEm: null,
    referencia: null,
    encargos: { multaPercentual: null, jurosPercentual: null, descontoPercentual: null, descontoDiasAntes: null },
  };
}

describe("comprovante pelo WhatsApp", () => {
  let empresaId = "";
  let vizinhaId = "";
  let clienteId = "";

  beforeAll(() => {
    process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.ASAAS_MOCK;
    delete process.env.TWILIO_MOCK;
  });

  beforeEach(async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Collab Software", cnpj: completarCnpj("770000000001") });
    const vizinha = await criarEmpresaDeTeste({ nomeFantasia: "Vizinha", cnpj: completarCnpj("770000000002") });
    empresaId = empresa.id;
    vizinhaId = vizinha.id;
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nomeFantasia: "Mini Marcket of Joy",
        razaoSocial: "Mini Marcket of Joy Ltda",
        documento: completarCnpj("770000000003"),
        tipoDocumento: "CNPJ",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: "mini@exemplo.test",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
      },
    });
    clienteId = cliente.id;
  });

  async function boleto() {
    return prisma.fatura.create({
      data: {
        empresaId,
        clienteId,
        provedor: "ASAAS",
        asaasPaymentId: "pay_comp",
        idExterno: "pay_comp",
        valor: "350.00",
        vencimento: new Date("2026-11-10T00:00:00.000Z"),
        status: "OVERDUE",
        statusNormalizado: "VENCIDO",
        formaCobranca: "BOLETO",
        criadoEm: new Date("2026-11-01T12:00:00.000Z"),
      },
    });
  }

  it("não lê comprovante com a opção desligada e não liquida sozinho", async () => {
    expect(await leituraComprovantesDaEmpresa(empresaId)).toBe(false);
    await expect(salvarLeituraComprovantes(autor(empresaId, "FINANCEIRO"), true)).rejects.toMatchObject({ status: 403 });
    await salvarLeituraComprovantes(autor(empresaId), true);
    const fatura = await boleto();
    const enviados: string[] = [];
    const twilio = {
      enviarTexto: async (_conta: CredencialTwilio, mensagem: { corpo: string }) => {
        enviados.push(mensagem.corpo);
        return { sid: "SM1" };
      },
    } as unknown as ClienteTwilio;
    const resultado = await registrarComprovanteRecebido({
      empresaId,
      messageSid: "SMcomprovante0001",
      de: "whatsapp:+5513988881001",
      para: "whatsapp:+5511999990000",
      bytes: arquivo({
        valor: "300.00",
        pagoEm: "2026-10-20",
        hora: "14:32",
        pagador: "Mini Marcket of Joy",
        recebedorNome: "Conta de outra pessoa",
        e2e: "E2ECOMP1",
      }),
      mime: "image/png",
      agora: AGORA,
      twilio,
      conta: { accountSid: "AC123", authToken: "token-de-teste" },
    });
    expect(resultado).toEqual({ gravado: true, situacao: "PENDENTE" });
    expect(enviados).toEqual(["Recebemos seu comprovante, vamos conferir e confirmar em breve."]);
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(gravada.status).toBe("OVERDUE");
    expect(gravada.statusNormalizado).toBe("VENCIDO");
    expect(gravada.comprovantePendente).toBe(true);
    expect(await prisma.conciliacaoPagamento.count({ where: { faturaId: fatura.id } })).toBe(0);
    const foraDaRegua = await prisma.fatura.count({
      where: { id: fatura.id, comprovantePendente: false, status: "OVERDUE" },
    });
    expect(foraDaRegua).toBe(0);
    const comprovante = await prisma.comprovantePagamento.findFirstOrThrow({ where: { faturaId: fatura.id } });
    expect(comprovante.situacao).toBe("PENDENTE");
    expect(comprovante.alertas).toEqual(expect.arrayContaining(["valor_divergente", "recebedor_divergente", "data_anterior_a_fatura"]));

    const repetido = arquivo({
      valor: "300.00",
      pagoEm: "2026-10-20",
      hora: "14:32",
      pagador: "Mini Marcket of Joy",
      recebedorNome: "Conta de outra pessoa",
      e2e: "E2ECOMP1",
    });
    const deNovo = await registrarComprovanteRecebido({
      empresaId,
      messageSid: "SMcomprovante0002",
      de: "whatsapp:+5513988881001",
      para: "whatsapp:+5511999990000",
      bytes: repetido,
      mime: "image/png",
      agora: AGORA,
    });
    expect(deNovo.gravado).toBe(true);
    const segundo = await prisma.comprovantePagamento.findFirstOrThrow({ where: { messageSid: "SMcomprovante0002" } });
    expect(segundo.alertas).toEqual(expect.arrayContaining(["e2e_duplicado", "comprovante_reutilizado"]));

    await expect(confirmarComprovante(autor(vizinhaId), comprovante.id, { agora: AGORA })).rejects.toMatchObject({ status: 409 });
    await expect(confirmarComprovante(autor(empresaId, "SUPORTE"), comprovante.id, { agora: AGORA })).rejects.toMatchObject({ status: 403 });
  });

  it("confirmar chama a baixa manual e rejeitar devolve a fatura à cobrança", async () => {
    await salvarLeituraComprovantes(autor(empresaId), true);
    await salvarConfiguracaoAsaas(autor(empresaId), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const fatura = await boleto();
    await registrarComprovanteRecebido({
      empresaId,
      messageSid: "SMconfirma0001",
      de: "whatsapp:+5513988881001",
      para: "whatsapp:+5511999990000",
      bytes: arquivo({
        valor: "350.00",
        pagoEm: "2026-11-20",
        recebedorNome: "Collab Software",
        e2e: "E2EOK",
      }),
      mime: "application/pdf",
      agora: AGORA,
    });
    const memoria = new AsaasMemoria("comp");
    memoria.cobrancas.set("pay_comp", cobranca("pay_comp"));
    const pendente = await prisma.comprovantePagamento.findFirstOrThrow({ where: { messageSid: "SMconfirma0001" } });
    await confirmarComprovante(autor(empresaId, "FINANCEIRO"), pendente.id, { agora: AGORA, asaas: memoria });
    const paga = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(paga.status).toBe("RECEIVED_IN_CASH");
    expect(paga.comprovantePendente).toBe(false);
    expect(memoria.recebimentosEmDinheiro[0]?.notifyCustomer).toBe(false);
    expect((await prisma.comprovantePagamento.findUniqueOrThrow({ where: { id: pendente.id } })).situacao).toBe("CONFIRMADO");
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: fatura.id, tipo: "PAGO" } })).toBe(0);

    const outra = await prisma.fatura.create({
      data: {
        empresaId,
        clienteId,
        provedor: "INTER",
        idExterno: "inter_comp",
        valor: "80.00",
        vencimento: new Date("2026-11-15T00:00:00.000Z"),
        status: "A_RECEBER",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });
    await registrarComprovanteRecebido({
      empresaId,
      messageSid: "SMrejeita0001",
      de: "whatsapp:+5513988881001",
      para: "whatsapp:+5511999990000",
      bytes: arquivo({ valor: "80.00", pagoEm: "2026-11-18", recebedorNome: "Collab Software", e2e: "E2ENA" }),
      mime: "image/jpeg",
      agora: AGORA,
    });
    const rejeitado = await prisma.comprovantePagamento.findFirstOrThrow({ where: { faturaId: outra.id } });
    await rejeitarComprovante(autor(empresaId), rejeitado.id, "O Pix não caiu na Cora");
    const deVolta = await prisma.fatura.findUniqueOrThrow({ where: { id: outra.id } });
    expect(deVolta.status).toBe("A_RECEBER");
    expect(deVolta.comprovantePendente).toBe(false);
    expect((await prisma.comprovantePagamento.findUniqueOrThrow({ where: { id: rejeitado.id } })).motivoRejeicao).toBe(
      "O Pix não caiu na Cora",
    );
  });

  it("ignora arquivo que não parece comprovante", async () => {
    await salvarLeituraComprovantes(autor(empresaId), true);
    const resultado = await registrarComprovanteRecebido({
      empresaId,
      messageSid: "SMfoto0001",
      de: "whatsapp:+5513988881001",
      para: "whatsapp:+5511999990000",
      bytes: new Uint8Array([1, 2, 3, 4]),
      mime: "image/png",
      agora: AGORA,
    });
    expect(resultado.gravado).toBe(false);
    expect(await prisma.comprovantePagamento.count({ where: { empresaId } })).toBe(0);
  });
});
