import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { gerarTokenWebhook } from "@/lib/asaas-cripto";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { InterMemoria } from "@/server/inter/memoria";
import { salvarCredenciaisPagamento } from "@/server/pagamentos/credenciais";
import { processarWebhookInter } from "./inter-webhook-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

beforeAll(() => {
  process.env.PAGAMENTOS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

usarBancoDeTeste();

async function preparar() {
  const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Inter", cnpj: completarCnpj("920000000001") });
  await prisma.empresa.update({ where: { id: empresa.id }, data: { provedorPagamento: "INTER" } });
  const segredo = gerarTokenWebhook();
  await salvarCredenciaisPagamento({
    empresaId: empresa.id,
    provedor: "INTER",
    ambiente: "SANDBOX",
    credenciais: {
      clientId: "client-inter",
      clientSecret: "segredo-inter",
      certificadoPem: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      chavePrivadaPem: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      extra: { conta_corrente: "1234567" },
    },
    segredoWebhook: segredo,
  });
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: empresa.id,
      nomeFantasia: "Cliente Inter",
      razaoSocial: "Cliente Inter Ltda",
      documento: completarCnpj("920000000002"),
      tipoDocumento: "CNPJ",
      segmento: "OUTRO",
      contatoNome: "Ana",
      whatsapp: "13988881001",
      email: "ana@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
      enderecoCobranca: "Rua A",
      numeroCobranca: "10",
      bairroCobranca: "Centro",
      cepCobranca: "11010000",
    },
  });
  const memoria = new InterMemoria();
  const cobranca = await memoria.criarCobranca({
    seuNumero: "COB1",
    valorNominal: "80.00",
    dataVencimento: "2026-12-10",
    pagador: {
      nome: "Cliente Inter",
      cpfCnpj: completarCnpj("920000000002"),
      tipoPessoa: "JURIDICA",
      endereco: "Rua A",
      bairro: "Centro",
      cidade: "Santos",
      uf: "SP",
      cep: "11010000",
    },
  });
  const fatura = await prisma.fatura.create({
    data: {
      empresaId: empresa.id,
      clienteId: cliente.id,
      provedor: "INTER",
      idExterno: cobranca.codigoSolicitacao,
      valor: "80.00",
      vencimento: new Date("2026-12-10T00:00:00.000Z"),
      status: "A_RECEBER",
      statusNormalizado: "PENDENTE",
      formaCobranca: "BOLETO",
    },
  });
  return { empresa, segredo, memoria, fatura, codigo: cobranca.codigoSolicitacao };
}

describe("webhook do Inter com reconsulta", () => {
  it("marca paga só depois que a API confirma e ignora o aviso repetido", async () => {
    const { segredo, memoria, fatura, codigo } = await preparar();
    memoria.marcar(codigo, "RECEBIDO", "2026-12-10");
    const corpo = [
      {
        codigoSolicitacao: codigo,
        situacao: "RECEBIDO",
        dataHoraSituacao: "2026-12-10T18:00:00.000Z",
        valorTotalRecebido: "80.00",
        origemRecebimento: "PIX",
      },
    ];
    await processarWebhookInter(segredo, corpo, memoria);
    const paga = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(paga.status).toBe("RECEBIDO");
    expect(paga.statusNormalizado).toBe("PAGO");
    expect(paga.pagoEm?.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(await prisma.eventoPagamento.count()).toBe(1);

    await processarWebhookInter(segredo, corpo, memoria);
    expect(await prisma.eventoPagamento.count()).toBe(1);
  });

  it("não marca paga se a consulta ainda mostra a cobrança em aberto", async () => {
    const { segredo, memoria, fatura, codigo } = await preparar();
    await processarWebhookInter(
      segredo,
      [{ codigoSolicitacao: codigo, situacao: "RECEBIDO", dataHoraSituacao: "2026-12-10T18:00:00.000Z" }],
      memoria,
    );
    const aberta = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(aberta.statusNormalizado).toBe("PENDENTE");
    expect(await prisma.eventoPagamento.count()).toBe(0);
  });

  it("responde erro quando a consulta falha, para o Inter tentar de novo", async () => {
    const { segredo, memoria, fatura, codigo } = await preparar();
    memoria.falharConsulta = true;
    await expect(
      processarWebhookInter(
        segredo,
        [{ codigoSolicitacao: codigo, situacao: "RECEBIDO", dataHoraSituacao: "2026-12-10T18:00:00.000Z" }],
        memoria,
      ),
    ).rejects.toMatchObject({ status: 503, codigo: "webhook_indisponivel" });
    const aberta = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(aberta.status).toBe("A_RECEBER");
    expect(await prisma.eventoPagamento.count()).toBe(0);
  });

  it("recusa segredo desconhecido", async () => {
    await preparar();
    await expect(processarWebhookInter("segredo-que-nao-existe-no-banco-0001", [])).rejects.toMatchObject({
      status: 401,
    });
  });
});
