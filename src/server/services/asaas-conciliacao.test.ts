import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/conciliacao/route";
import { isoDeData } from "@/lib/data";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import {
  type CobrancaAsaas,
  type ClienteHttpAsaas,
  ErroAsaas,
  type FiltroListaCobrancasAsaas,
} from "@/server/asaas/contrato";
import { prisma } from "@/server/db";
import { processarWebhookAsaas } from "./asaas-webhook-service";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import {
  conciliarAsaasEmpresa,
  executarConciliacaoAsaas,
  sincronizarAsaasDoAutor,
} from "./asaas-conciliacao";
import { criarCliente } from "./cliente-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const AGORA = new Date("2026-11-04T15:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
});

beforeEach(async () => {
  delete process.env.ASAAS_MOCK;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Armazém", cnpj: completarCnpj("570000000081") })).id;
  outraEmpresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra", cnpj: completarCnpj("570000000082") })).id;
});

function autor(papel: PapelUsuario, id = empresaId) {
  return { empresaId: id, papel };
}

function pessoa(documento: string) {
  return {
    nomeFantasia: "Armazém dos Ovos",
    razaoSocial: "Armazém dos Ovos Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

function cobranca(parcial: Partial<CobrancaAsaas> & Pick<CobrancaAsaas, "id">): CobrancaAsaas {
  return {
    customer: "cus_ovo",
    subscription: null,
    valor: "150.00",
    vencimento: "2026-11-10",
    status: "PENDING",
    formaCobranca: "PIX",
    boletoUrl: null,
    faturaUrl: `https://sandbox.asaas.com/i/${parcial.id}`,
    descricao: "Armazém dos Ovos",
    excluida: false,
    pagoEm: null,
    referencia: null,
    ...parcial,
  };
}

function httpDe(lista: CobrancaAsaas[], criadas: string[] = []) {
  const http = {
    async obterCobranca(id: string) {
      const achada = lista.find((item) => item.id === id);
      if (!achada) throw new ErroAsaas("Cobrança não encontrada.", 404);
      return achada;
    },
    async listarCobrancas(filtro: FiltroListaCobrancasAsaas) {
      let itens = lista;
      if (filtro.dateCreatedGe) {
        itens = itens.filter((item) => criadas.includes(item.id));
      }
      if (filtro.status) itens = itens.filter((item) => item.status === filtro.status);
      if (filtro.paymentDateGe) {
        itens = itens.filter((item) => item.pagoEm !== null && item.pagoEm >= filtro.paymentDateGe!);
      }
      const fatia = itens.slice(filtro.offset, filtro.offset + filtro.limit);
      return { cobrancas: fatia, temMais: filtro.offset + filtro.limit < itens.length };
    },
    async obterVisualizacao() {
      return { faturaEm: new Date("2026-11-03T12:00:00.000Z"), boletoEm: null };
    },
  };
  return http as unknown as ClienteHttpAsaas;
}

async function configurar(id = empresaId) {
  await salvarConfiguracaoAsaas(autor("DONO", id), { ambiente: "SANDBOX", chaveApi: CHAVE });
}

async function gravarFatura(dados: {
  clienteId: string;
  pagamento: string;
  status: string;
  vencimento: string;
  empresa?: string;
  pagoEm?: string | null;
  excluida?: boolean;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: dados.pagamento,
      valor: "150.00",
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      status: dados.status,
      formaCobranca: "PIX",
      excluida: dados.excluida ?? false,
      pagoEm: dados.pagoEm ? new Date(`${dados.pagoEm}T00:00:00.000Z`) : null,
    },
  });
}

const opcoesBase = { agora: AGORA, pausaMs: 0, manual: true as const };

describe("conciliação com o Asaas", () => {
  it("recusa financeiro e empresa sem Asaas", async () => {
    await expect(sincronizarAsaasDoAutor(autor("FINANCEIRO"), { http: httpDe([]) })).rejects.toMatchObject({
      status: 403,
    });
    await expect(sincronizarAsaasDoAutor(autor("DONO"))).rejects.toMatchObject({
      status: 409,
      codigo: "asaas_nao_configurado",
    });
  });

  it("marca a fatura paga com a data do Asaas e não repete o WhatsApp", async () => {
    await configurar();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000083")));
    const fatura = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_pxvijs4fxkmi8iq9",
      status: "PENDING",
      vencimento: "2026-11-10",
    });
    const http = httpDe([
      cobranca({
        id: "pay_pxvijs4fxkmi8iq9",
        status: "RECEIVED",
        pagoEm: "2026-11-04",
        formaCobranca: "PIX",
      }),
    ]);

    const primeiro = await conciliarAsaasEmpresa(empresaId, { ...opcoesBase, http });
    expect(primeiro.atualizadas).toBe(1);
    const paga = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(paga.status).toBe("RECEIVED");
    expect(paga.statusNormalizado).toBe("PAGO");
    expect(paga.pagoEm ? isoDeData(paga.pagoEm) : null).toBe("2026-11-04");
    expect(await prisma.filaWhatsapp.count({ where: { empresaId, faturaId: fatura.id, tipo: "PAGO" } })).toBe(1);

    const segundo = await conciliarAsaasEmpresa(empresaId, { ...opcoesBase, http });
    expect(segundo.atualizadas).toBe(0);
    expect(segundo.criadas).toBe(0);
    expect(await prisma.filaWhatsapp.count({ where: { empresaId, tipo: "PAGO" } })).toBe(1);
  });

  it("atualiza vencida, excluída e estornada sem WhatsApp de pago", async () => {
    await configurar();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000084")));
    const vencida = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_vence",
      status: "PENDING",
      vencimento: "2026-11-01",
    });
    const apagada = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_apaga",
      status: "PENDING",
      vencimento: "2026-11-02",
    });
    const paga = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_estorna",
      status: "RECEIVED",
      vencimento: "2026-10-20",
      pagoEm: "2026-11-02",
    });
    const http = httpDe([
      cobranca({ id: "pay_vence", status: "OVERDUE", vencimento: "2026-11-01" }),
      cobranca({ id: "pay_apaga", status: "RECEIVED", excluida: true, pagoEm: "2026-11-03" }),
      cobranca({ id: "pay_estorna", status: "REFUNDED", pagoEm: "2026-11-02", valor: "150.00" }),
    ]);

    await conciliarAsaasEmpresa(empresaId, { ...opcoesBase, http });
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: vencida.id } })).status).toBe("OVERDUE");
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: apagada.id } })).excluida).toBe(true);
    const estornada = await prisma.fatura.findUniqueOrThrow({ where: { id: paga.id } });
    expect(estornada.status).toBe("REFUNDED");
    expect(estornada.statusNormalizado).toBe("ESTORNADO");
    expect(estornada.pagoEm).toBeNull();
    expect(await prisma.filaWhatsapp.count({ where: { empresaId, tipo: "PAGO" } })).toBe(0);
  });

  it("grava recebimento em dinheiro e cria a cobrança nova do cliente conhecido", async () => {
    await configurar();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000085")));
    await prisma.cliente.update({ where: { id: cliente.id }, data: { asaasCustomerId: "cus_ovo" } });
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_dinheiro",
      status: "PENDING",
      vencimento: "2026-11-08",
    });
    const http = httpDe(
      [
        cobranca({ id: "pay_dinheiro", status: "RECEIVED_IN_CASH", pagoEm: "2026-11-04" }),
        cobranca({ id: "pay_nova", status: "PENDING", vencimento: "2026-12-01", valor: "80.00" }),
        cobranca({ id: "pay_alheia", customer: "cus_de_fora", status: "PENDING" }),
      ],
      ["pay_nova", "pay_alheia"],
    );

    const resultado = await conciliarAsaasEmpresa(empresaId, { ...opcoesBase, http });
    expect(resultado.criadas).toBe(1);
    const dinheiro = await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_dinheiro" } });
    expect(dinheiro.status).toBe("RECEIVED_IN_CASH");
    expect(dinheiro.statusNormalizado).toBe("PAGO");
    expect(dinheiro.pagoEm ? isoDeData(dinheiro.pagoEm) : null).toBe("2026-11-04");
    const nova = await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_nova" } });
    expect(nova.clienteId).toBe(cliente.id);
    expect(nova.valor.toFixed(2)).toBe("80.00");
    expect(await prisma.fatura.findFirst({ where: { asaasPaymentId: "pay_alheia" } })).toBeNull();
  });

  it("acha o pagamento recente mesmo fora do lote de faturas em aberto", async () => {
    await configurar();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000086")));
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_antiga",
      status: "PENDING",
      vencimento: "2026-01-01",
    });
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_pxvijs4fxkmi8iq9",
      status: "PENDING",
      vencimento: "2026-11-10",
    });
    const http = httpDe([
      cobranca({ id: "pay_antiga", status: "PENDING", vencimento: "2026-01-01" }),
      cobranca({ id: "pay_pxvijs4fxkmi8iq9", status: "RECEIVED", pagoEm: "2026-11-04" }),
    ]);

    await conciliarAsaasEmpresa(empresaId, { ...opcoesBase, http, limiteAbertas: 1 });
    const recente = await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_pxvijs4fxkmi8iq9" } });
    expect(recente.status).toBe("RECEIVED");
    expect(recente.pagoEm ? isoDeData(recente.pagoEm) : null).toBe("2026-11-04");
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_antiga" } })).status).toBe("PENDING");
  });

  it("isola a empresa que falha e ignora empresa suspensa", async () => {
    await configurar();
    await configurar(outraEmpresaId);
    const suspensa = await criarEmpresaDeTeste({
      nomeFantasia: "Suspensa",
      cnpj: completarCnpj("570000000087"),
      status: "SUSPENSA",
    });
    await salvarConfiguracaoAsaas(autor("DONO", suspensa.id), { ambiente: "SANDBOX", chaveApi: CHAVE });
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000088")));
    const outroCliente = await criarCliente(outraEmpresaId, pessoa(completarCnpj("570000000089")));
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_ok",
      status: "PENDING",
      vencimento: "2026-11-10",
    });
    await gravarFatura({
      clienteId: outroCliente.id,
      pagamento: "pay_falha",
      status: "PENDING",
      vencimento: "2026-11-10",
      empresa: outraEmpresaId,
    });
    const boa = httpDe([cobranca({ id: "pay_ok", status: "CONFIRMED", pagoEm: "2026-11-04" })]);
    const ruim = {
      async obterCobranca() {
        throw new ErroAsaas("O Asaas limitou as consultas. Tente de novo daqui a pouco.", 429, 30);
      },
      async listarCobrancas() {
        throw new ErroAsaas("O Asaas limitou as consultas. Tente de novo daqui a pouco.", 429, 30);
      },
    };

    const cron = await executarConciliacaoAsaas({
      agora: AGORA,
      pausaMs: 0,
      httpDaEmpresa(id) {
        if (id === outraEmpresaId) return ruim;
        return boa;
      },
    });
    expect(cron.empresas).toBe(2);
    expect(cron.atualizadas).toBe(1);
    expect(cron.interrompidas).toBe(1);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_ok" } })).status).toBe("CONFIRMED");
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_falha" } })).status).toBe("PENDING");
  });

  it("o cron usa o segredo existente e devolve o resumo do Asaas", async () => {
    const anterior = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await cronGet(new Request("http://127.0.0.1/api/cron/conciliacao"))).status).toBe(500);
      process.env.CRON_SECRET = "segredo-cron-de-teste";
      expect(
        (
          await cronPost(
            new Request("http://127.0.0.1/api/cron/conciliacao", {
              method: "POST",
              headers: { authorization: "Bearer errado" },
            }),
          )
        ).status,
      ).toBe(401);
      const ok = await cronGet(
        new Request("http://127.0.0.1/api/cron/conciliacao", {
          headers: { authorization: "Bearer segredo-cron-de-teste" },
        }),
      );
      expect(ok.status).toBe(200);
      const corpo = (await ok.json()) as { ok: boolean; asaas: { empresas: number } };
      expect(corpo.ok).toBe(true);
      expect(corpo.asaas.empresas).toBe(0);
    } finally {
      if (anterior === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = anterior;
    }
  });

  it("o clique atualiza pagamento e visualização no mesmo resultado", async () => {
    await configurar();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("570000000090")));
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_vista",
      status: "PENDING",
      vencimento: "2026-11-10",
    });
    const http = httpDe([cobranca({ id: "pay_vista", status: "RECEIVED", pagoEm: "2026-11-04" })]);
    const resultado = await sincronizarAsaasDoAutor(autor("DONO"), { ...opcoesBase, http });
    expect(resultado.pagamentos).toBe(1);
    expect(resultado.marcadas).toBe(1);
    expect(resultado.atualizadas).toBe(2);
    const fatura = await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_vista" } });
    expect(fatura.statusNormalizado).toBe("PAGO");
    expect(fatura.visualizada).toBe(true);
  });

  it("registra o 401 do webhook sem o token", async () => {
    await configurar();
    const chamadas: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      chamadas.push(args);
    });
    try {
      await expect(processarWebhookAsaas(null, { id: "evt_sem_token", event: "PAYMENT_RECEIVED" })).rejects.toMatchObject({
        status: 401,
        codigo: "webhook_recusado",
      });
      const token = "token-super-secreto-xyz";
      await expect(
        processarWebhookAsaas(token, {
          id: "evt_diag_401",
          event: "PAYMENT_RECEIVED",
          payment: { id: "pay_diag", status: "RECEIVED" },
        }),
      ).rejects.toMatchObject({ status: 401, codigo: "webhook_recusado" });
      const texto = JSON.stringify(chamadas);
      expect(texto).toContain("webhook_recusado");
      expect(texto).toContain("ausente");
      expect(texto).toContain("nao_confere");
      expect(texto).toContain("evt_diag_401");
      expect(texto).not.toContain(token);
      expect(texto).not.toContain(CHAVE);
    } finally {
      spy.mockRestore();
    }
  });
});
