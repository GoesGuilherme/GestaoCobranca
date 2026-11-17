import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completarCnpj, completarCpf } from "@/lib/documento";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { emitirFatura } from "./fatura-service";
import { definirFormaPadrao, painelFormasCobranca } from "./formas-cobranca-service";
import { salvarConfiguracaoPix } from "./pix-config-service";
import { executarRecorrenciasPix } from "./pix-recorrencia";
import { ativarRecorrencia } from "./recorrencia-service";
import { criarServico } from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

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
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Collab Software", cnpj: completarCnpj("910000000011") })).id;
});

function autor() {
  return { empresaId, papel: "DONO" as const, email: "dono@exemplo.test", nomeEmpresa: "Collab Software" };
}

async function cliente() {
  return criarCliente(empresaId, {
    nomeFantasia: "Costa Verde",
    razaoSocial: "Costa Verde Ltda",
    documento: completarCpf("529982247"),
    segmento: "OUTRO",
    contatoNome: "Ana",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
  });
}

async function chavePix() {
  await salvarConfiguracaoPix(autor(), {
    tipoChave: "CNPJ",
    chavePix: completarCnpj("112223330001"),
    nomeRecebedor: "Collab Software",
    cidadeRecebedor: "Santos",
  });
}

describe("lista de formas por configuração da empresa", () => {
  it("mostra só o que está configurado e mantém PIX direto como padrão", async () => {
    expect((await painelFormasCobranca(empresaId)).opcoes).toEqual([]);
    await chavePix();
    await definirFormaPadrao(autor(), "PIX_DIRETO");
    await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    await prisma.configuracaoPagamento.create({
      data: {
        empresaId,
        provedor: "EFI",
        ambiente: "SANDBOX",
        credenciaisCifradas: "nao-emite",
        ativo: true,
      },
    });
    const painel = await painelFormasCobranca(empresaId);
    expect(painel.opcoes.map((item) => item.rotulo)).toEqual([
      "PIX direto (da empresa)",
      "Pix (Asaas)",
      "Boleto (Asaas)",
      "Cartão de crédito (Asaas)",
      "Cliente escolhe (Asaas)",
    ]);
    expect(painel.padraoId).toBe("PIX_DIRETO");
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).provedorPagamento).toBe("PIX_DIRETO");
  });

  it("inclui Cora e Inter quando a conexão existe", async () => {
    await prisma.configuracaoPagamento.createMany({
      data: [
        { empresaId, provedor: "CORA", ambiente: "SANDBOX", credenciaisCifradas: "cora", ativo: true },
        { empresaId, provedor: "INTER", ambiente: "SANDBOX", credenciaisCifradas: "inter", ativo: true },
      ],
    });
    const rotulos = (await painelFormasCobranca(empresaId)).opcoes.map((item) => item.rotulo);
    expect(rotulos).toEqual(["Boleto + Pix (Cora)", "Boleto + Pix (Inter)"]);
  });
});

describe("emissão segue a forma escolhida", () => {
  it("emite no Asaas mesmo com a empresa em PIX direto, e a recorrência Pix segue a própria escolha", async () => {
    await chavePix();
    await salvarConfiguracaoAsaas(autor(), { ambiente: "SANDBOX", chaveApi: CHAVE });
    await definirFormaPadrao(autor(), "PIX_DIRETO");
    const cadastro = await cliente();
    const memoria = new AsaasMemoria("forma");

    const pix = await emitirFatura(autor(), cadastro.id, {
      valor: "80.00",
      vencimento: "2026-12-20",
      formaCobranca: "PIX",
    });
    expect(pix.provedor).toBe("PIX_DIRETO");
    expect(pix.formaCobranca).toBe("PIX");
    expect(pix.pixCopiaCola).toBeTruthy();

    const boleto = await emitirFatura(
      autor(),
      cadastro.id,
      { valor: "90.00", vencimento: "2026-12-21", provedor: "ASAAS", formaCobranca: "BOLETO" },
      memoria,
    );
    expect(boleto.provedor).toBe("ASAAS");
    expect(boleto.formaCobranca).toBe("BOLETO");
    expect(boleto.boletoUrl).toBeTruthy();
    expect(memoria.cobrancas.size).toBe(1);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).provedorPagamento).toBe("PIX_DIRETO");

    await expect(
      emitirFatura(autor(), cadastro.id, { valor: "10.00", vencimento: "2026-12-22", provedor: "INTER", formaCobranca: "BOLETO" }),
    ).rejects.toMatchObject({ codigo: "forma_indisponivel" });

    const servico = await criarServico(autor(), { nome: "Suporte", precoPadrao: "40,00", ativo: true });
    const vinculo = await criarServicoDoCliente(autor(), cadastro.id, {
      servicoId: servico.id,
      valor: "40,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-01",
      status: "ATIVO",
    });
    await prisma.empresa.update({ where: { id: empresaId }, data: { provedorPagamento: "ASAAS" } });
    await ativarRecorrencia(autor(), vinculo.id, {
      diaVencimento: 10,
      proximoVencimento: "2026-12-10",
      valor: "40,00",
      descricao: "Mensalidade",
      provedor: "PIX_DIRETO",
      formaCobranca: "PIX",
    });
    const gravado = await prisma.clienteServico.findUniqueOrThrow({ where: { id: vinculo.id } });
    expect(gravado.provedorRecorrente).toBe("PIX_DIRETO");
    expect(gravado.formaCobrancaRecorrente).toBe("PIX");
    expect(gravado.asaasSubscriptionId).toBeNull();

    const rodada = await executarRecorrenciasPix({ agora: new Date("2026-12-10T15:00:00.000Z"), empresaId });
    expect(rodada.emitidas).toBeGreaterThanOrEqual(1);
    const faturas = await prisma.fatura.findMany({ where: { clienteServicoId: vinculo.id, provedor: "PIX_DIRETO" } });
    expect(faturas.length).toBeGreaterThan(0);
    expect(faturas.every((item) => item.pixCopiaCola)).toBe(true);
  });
});
