import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/visualizacoes/route";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { type ClienteHttpAsaas, ErroAsaas, type VisualizacaoCobrancaAsaas } from "@/server/asaas/contrato";
import { afirmarMockAsaasPermitido, mockAsaasLigado } from "@/server/asaas/fabrica";
import { prisma } from "@/server/db";
import { salvarConfiguracaoAsaas } from "./asaas-config-service";
import { criarCliente } from "./cliente-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import {
  sincronizarVisualizacoesAgendadas,
  sincronizarVisualizacoesDoAutor,
} from "./visualizacao-fatura-service";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

usarBancoDeTeste();

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";
const AGORA = new Date("2026-10-31T15:00:00.000Z");
const FATURA_EM = new Date("2026-10-31T12:15:00.000Z");
const BOLETO_EM = new Date("2026-10-30T11:00:00.000Z");

let empresaId = "";
let outraEmpresaId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.ASAAS_MOCK;
});

beforeEach(async () => {
  delete process.env.ASAAS_MOCK;
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Vista", cnpj: completarCnpj("570000000041") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Vista", cnpj: completarCnpj("570000000042") })
  ).id;
});

function autor(papel: PapelUsuario, id = empresaId) {
  return { empresaId: id, papel };
}

function pessoa(documento: string) {
  return {
    nomeFantasia: "Costa Verde Exemplo",
    razaoSocial: "Costa Verde Exemplo Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  };
}

function httpDe(
  responder: (id: string) => VisualizacaoCobrancaAsaas | Promise<VisualizacaoCobrancaAsaas>,
): { http: ClienteHttpAsaas; ids: string[] } {
  const ids: string[] = [];
  const http = {
    async obterVisualizacao(id: string) {
      ids.push(id);
      return responder(id);
    },
  } as unknown as ClienteHttpAsaas;
  return { http, ids };
}

async function configurar(id = empresaId) {
  await salvarConfiguracaoAsaas(autor("DONO", id), { ambiente: "SANDBOX", chaveApi: CHAVE });
}

async function abrirCliente(id = empresaId, documento = "570000000043") {
  return criarCliente(id, pessoa(completarCnpj(documento)));
}

async function gravarFatura(dados: {
  clienteId: string;
  pagamento: string | null;
  status: string;
  vencimento: string;
  empresa?: string;
  criadoEm?: Date;
  visualizada?: boolean;
  visualizadaEm?: Date | null;
  excluida?: boolean;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: dados.pagamento,
      valor: "10.00",
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      status: dados.status,
      formaCobranca: "BOLETO",
      excluida: dados.excluida ?? false,
      visualizada: dados.visualizada ?? false,
      visualizadaEm: dados.visualizadaEm ?? null,
      criadoEm: dados.criadoEm,
    },
  });
}

describe("sincronização de visualizações", () => {
  it("não liga o mock do Asaas", () => {
    expect(process.env.ASAAS_MOCK ?? "").not.toBe("true");
    expect(mockAsaasLigado()).toBe(false);
    expect(() => afirmarMockAsaasPermitido({ ASAAS_MOCK: "true", NODE_ENV: "production" })).toThrow(/ASAAS_MOCK/);
  });

  it("recusa financeiro, suporte e empresa sem Asaas", async () => {
    const { http } = httpDe(() => {
      throw new Error("não deveria consultar");
    });
    await expect(sincronizarVisualizacoesDoAutor(autor("FINANCEIRO"), { http })).rejects.toMatchObject({ status: 403 });
    await expect(sincronizarVisualizacoesDoAutor(autor("SUPORTE"), { http })).rejects.toMatchObject({ status: 403 });
    await expect(sincronizarVisualizacoesDoAutor(autor("DONO"), { http })).rejects.toMatchObject({
      status: 409,
      codigo: "asaas_nao_configurado",
    });
  });

  it("marca a data mais antiga, ignora vazia e não desmarca", async () => {
    await configurar();
    const cliente = await abrirCliente();
    const vistaEm = new Date("2026-08-01T12:00:00.000Z");
    const jaVista = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_ja",
      status: "PENDING",
      vencimento: "2026-10-01",
      visualizada: true,
      visualizadaEm: vistaEm,
    });
    const aberta = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_aberta",
      status: "PENDING",
      vencimento: "2026-11-01",
    });
    const vazia = await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_vazia",
      status: "OVERDUE",
      vencimento: "2026-11-02",
    });
    const { http, ids } = httpDe((id) => {
      if (id === "pay_ja") return { faturaEm: new Date("2020-01-01T00:00:00.000Z"), boletoEm: null };
      if (id === "pay_aberta") return { faturaEm: FATURA_EM, boletoEm: BOLETO_EM };
      return { faturaEm: null, boletoEm: null };
    });

    const primeiro = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
    expect(primeiro.marcadas).toBe(1);
    expect(primeiro.interrompida).toBe(false);
    expect(ids).toEqual(["pay_aberta", "pay_vazia"]);
    const marcada = await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } });
    expect(marcada.visualizada).toBe(true);
    expect(marcada.visualizadaEm?.toISOString()).toBe(BOLETO_EM.toISOString());
    expect(marcada.status).toBe("PENDING");
    expect(marcada.valor.toFixed(2)).toBe("10.00");
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: vazia.id } })).visualizada).toBe(false);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: jaVista.id } })).visualizadaEm?.toISOString()).toBe(
      vistaEm.toISOString(),
    );

    ids.length = 0;
    const segundo = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
    expect(segundo.marcadas).toBe(0);
    expect(ids).toEqual(["pay_vazia"]);
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: aberta.id } })).visualizadaEm?.toISOString()).toBe(
      BOLETO_EM.toISOString(),
    );
  });

  it("consulta abertas, vencidas e recentes, e deixa o resto quieto", async () => {
    await configurar();
    await configurar(outraEmpresaId);
    const cliente = await abrirCliente();
    const outro = await abrirCliente(outraEmpresaId, "570000000044");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_ok", status: "PENDING", vencimento: "2026-11-01", criadoEm: new Date("2025-01-01T00:00:00.000Z") });
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_vencida", status: "OVERDUE", vencimento: "2026-11-02", criadoEm: new Date("2025-01-01T00:00:00.000Z") });
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_recente",
      status: "RECEIVED",
      vencimento: "2026-11-03",
      criadoEm: new Date("2026-10-20T12:00:00.000Z"),
    });
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_antiga",
      status: "RECEIVED",
      vencimento: "2026-08-01",
      criadoEm: new Date("2025-06-01T12:00:00.000Z"),
    });
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_criando", status: "CRIANDO", vencimento: "2026-10-01" });
    await gravarFatura({
      clienteId: cliente.id,
      pagamento: "pay_excluida",
      status: "PENDING",
      vencimento: "2026-10-02",
      excluida: true,
    });
    await gravarFatura({ clienteId: cliente.id, pagamento: null, status: "PENDING", vencimento: "2026-10-03" });
    await gravarFatura({
      clienteId: outro.id,
      pagamento: "pay_outra",
      status: "PENDING",
      vencimento: "2026-10-04",
      empresa: outraEmpresaId,
    });

    const { http, ids } = httpDe(() => ({ faturaEm: FATURA_EM, boletoEm: null }));
    const resultado = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
    expect(resultado.marcadas).toBe(3);
    expect(ids).toEqual(["pay_ok", "pay_vencida", "pay_recente"]);
    expect(await prisma.fatura.count({ where: { empresaId, visualizada: true } })).toBe(3);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_antiga" } })).visualizada).toBe(false);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_criando" } })).visualizada).toBe(false);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_excluida" } })).visualizada).toBe(false);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_outra" } })).visualizada).toBe(false);
  });

  it("para no fim do lote e continua na próxima chamada", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000045");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_1", status: "PENDING", vencimento: "2026-11-01" });
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_2", status: "PENDING", vencimento: "2026-11-02" });
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_3", status: "PENDING", vencimento: "2026-11-03" });
    const { http, ids } = httpDe(() => ({ faturaEm: FATURA_EM, boletoEm: null }));

    const primeiro = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA, limite: 1 });
    expect(primeiro).toMatchObject({ marcadas: 1, restantes: 2, interrompida: false });
    expect(ids).toEqual(["pay_1"]);

    const segundo = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA, limite: 1 });
    expect(segundo.marcadas).toBe(1);
    expect(ids).toEqual(["pay_1", "pay_2"]);
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_3" } })).visualizada).toBe(false);
  });

  it("consulta no máximo quatro faturas ao mesmo tempo", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000046");
    for (let i = 0; i < 8; i += 1) {
      await gravarFatura({
        clienteId: cliente.id,
        pagamento: `pay_c${i}`,
        status: "PENDING",
        vencimento: `2026-11-${String(i + 1).padStart(2, "0")}`,
      });
    }
    let emVoo = 0;
    let pico = 0;
    const http = {
      async obterVisualizacao() {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await new Promise((resolver) => setTimeout(resolver, 30));
        emVoo -= 1;
        return { faturaEm: FATURA_EM, boletoEm: null };
      },
    } as unknown as ClienteHttpAsaas;

    const resultado = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
    expect(resultado.marcadas).toBe(8);
    expect(pico).toBeGreaterThan(1);
    expect(pico).toBeLessThanOrEqual(4);
  });

  it("para no limite do Asaas sem desmarcar e segue depois", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000047");
    for (let i = 0; i < 6; i += 1) {
      await gravarFatura({
        clienteId: cliente.id,
        pagamento: `pay_l${i}`,
        status: "PENDING",
        vencimento: `2026-12-${String(i + 1).padStart(2, "0")}`,
      });
    }
    let chamadas = 0;
    const http = {
      async obterVisualizacao() {
        chamadas += 1;
        await Promise.resolve();
        throw new ErroAsaas("Seu acesso foi temporariamente bloqueado.", 429, 30);
      },
    } as unknown as ClienteHttpAsaas;

    const parado = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
    expect(parado).toMatchObject({ marcadas: 0, interrompida: true, restantes: 6 });
    expect(chamadas).toBe(4);
    expect(await prisma.fatura.count({ where: { empresaId, visualizada: true } })).toBe(0);

    const livre = httpDe(() => ({ faturaEm: BOLETO_EM, boletoEm: null }));
    const deNovo = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http: livre.http, agora: AGORA });
    expect(deNovo.marcadas).toBe(6);
    expect(deNovo.restantes).toBe(0);
  });

  it("uma falha não impede as outras nem troca quem já foi vista", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000048");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_falha", status: "PENDING", vencimento: "2026-11-01" });
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_ok", status: "PENDING", vencimento: "2026-11-02" });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { http } = httpDe((id) => {
      if (id === "pay_falha") throw new ErroAsaas("O Asaas recusou a operação.", 500);
      return { faturaEm: FATURA_EM, boletoEm: null };
    });
    try {
      const resultado = await sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA });
      expect(resultado).toMatchObject({ marcadas: 1, falhas: 1, interrompida: false });
      expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_falha" } })).visualizada).toBe(false);
      expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_ok" } })).visualizada).toBe(true);
    } finally {
      erro.mockRestore();
    }
  });

  it("recusa a chave inválida e não marca", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000049");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_chave", status: "PENDING", vencimento: "2026-11-01" });
    const http = {
      async obterVisualizacao() {
        throw new ErroAsaas("O Asaas recusou a chave.", 401);
      },
    } as unknown as ClienteHttpAsaas;
    await expect(sincronizarVisualizacoesDoAutor(autor("DONO"), { http, agora: AGORA })).rejects.toMatchObject({
      status: 400,
      codigo: "asaas_nao_autorizado",
    });
    expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_chave" } })).visualizada).toBe(false);
  });

  it("usa a chave da própria empresa no viewingInfo", async () => {
    await configurar();
    const cliente = await abrirCliente(empresaId, "570000000050");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_view_http", status: "PENDING", vencimento: "2026-11-15" });
    const pedidos: { url: string; token: string | null; method: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (entrada, init) => {
      const headers = new Headers(init?.headers);
      pedidos.push({
        url: String(entrada),
        token: headers.get("access_token"),
        method: init?.method ?? "GET",
      });
      return new Response(
        JSON.stringify({ invoiceViewedDate: "2026-10-02 10:00:00", boletoViewedDate: "2026-10-03 10:00:00" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      expect(process.env.ASAAS_MOCK ?? "").not.toBe("true");
      const resultado = await sincronizarVisualizacoesDoAutor(autor("DONO"), { agora: AGORA });
      expect(resultado.marcadas).toBe(1);
      expect(pedidos).toEqual([
        {
          url: "https://api-sandbox.asaas.com/v3/payments/pay_view_http/viewingInfo",
          token: CHAVE,
          method: "GET",
        },
      ]);
      const fatura = await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_view_http" } });
      expect(fatura.visualizadaEm?.toISOString()).toBe("2026-10-02T13:00:00.000Z");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("o cron usa o segredo existente e segue para a próxima empresa", async () => {
    const original = globalThis.fetch;
    const chamadas: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      chamadas.push(String(input));
      throw new Error("rede");
    }) as typeof fetch;
    const anterior = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await cronGet(new Request("http://127.0.0.1/api/cron/visualizacoes"))).status).toBe(500);
      process.env.CRON_SECRET = "segredo-cron-de-teste";
      expect(
        (
          await cronPost(
            new Request("http://127.0.0.1/api/cron/visualizacoes", {
              method: "POST",
              headers: { authorization: "Bearer errado" },
            }),
          )
        ).status,
      ).toBe(401);
      const ok = await cronGet(
        new Request("http://127.0.0.1/api/cron/visualizacoes", {
          headers: { authorization: "Bearer segredo-cron-de-teste" },
        }),
      );
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, empresas: 0, marcadas: 0, empresasComFalha: 0 });
      expect(chamadas).toEqual([]);
      expect(process.env.ASAAS_MOCK ?? "").not.toBe("true");
    } finally {
      globalThis.fetch = original;
      if (anterior === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = anterior;
    }

    await configurar();
    await configurar(outraEmpresaId);
    const cliente = await abrirCliente(empresaId, "570000000051");
    const outro = await abrirCliente(outraEmpresaId, "570000000052");
    await gravarFatura({ clienteId: cliente.id, pagamento: "pay_a1", status: "PENDING", vencimento: "2026-11-01" });
    await gravarFatura({
      clienteId: outro.id,
      pagamento: "pay_b1",
      status: "PENDING",
      vencimento: "2026-11-01",
      empresa: outraEmpresaId,
    });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const http = {
      async obterVisualizacao(id: string) {
        if (id.startsWith("pay_a")) throw new ErroAsaas("O Asaas recusou a chave.", 401);
        return { faturaEm: FATURA_EM, boletoEm: null };
      },
    } as unknown as ClienteHttpAsaas;
    try {
      const cron = await sincronizarVisualizacoesAgendadas({ http, agora: AGORA });
      expect(cron).toEqual({ empresas: 2, marcadas: 1, empresasComFalha: 1 });
      expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_a1" } })).visualizada).toBe(false);
      expect((await prisma.fatura.findFirstOrThrow({ where: { asaasPaymentId: "pay_b1" } })).visualizada).toBe(true);
    } finally {
      erro.mockRestore();
    }
  });
});
