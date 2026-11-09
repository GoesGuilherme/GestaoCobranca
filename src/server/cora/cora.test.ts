import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callbackCora } from "@/app/api/integracoes/cora/callback/route";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { criarAdaptadorCora } from "@/server/pagamentos/adaptador-cora";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "@/server/services/teste-db";
import { emitirFaturaCora, cancelarFaturaCora } from "@/server/services/cora-cobranca";
import { concluirOauthCora, iniciarOauthCora } from "@/server/services/cora-oauth-service";
import { processarWebhookCora } from "@/server/services/cora-webhook-service";
import type { Acesso } from "@/server/auth/acesso";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import type { TransporteCora } from "./contrato";
import { REDIRECT_PADRAO_CORA, URL_PRODUCAO_CORA, URL_STAGE_CORA, baseCora } from "./ambiente";
import { COOKIE_OAUTH_CORA, hashEstadoOauth } from "./estado";
import { CoraMemoria } from "./memoria";
import { corpoFaturaCora, criarClienteHttpCora, lerFaturaCora, urlAutorizacaoCora } from "./http";
import { limparCacheCora } from "./conta";

const { jarOauth } = vi.hoisted(() => ({ jarOauth: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(nome: string) {
      const value = jarOauth.get(nome);
      return value === undefined ? undefined : { name: nome, value };
    },
  }),
}));

const CODIGO_CORA =
  "006081d3-9f5a-41ac-80b1-c64888962332.18dc33de-d69f-4c16-ac1f-c1d0ac075712.3cfcfebb-6d4a-4845-91f9-d01572e8ce69";

beforeAll(() => {
  process.env.PAGAMENTOS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

beforeEach(() => {
  process.env.CORA_CLIENT_ID = "app-parceiro-teste";
  process.env.CORA_CLIENT_SECRET = "segredo-parceiro-teste";
  delete process.env.CORA_AMBIENTE;
  delete process.env.CORA_API_BASE;
  delete process.env.CORA_REDIRECT_URI;
  delete process.env.CORA_WEBHOOK_SEGREDO;
  jarOauth.clear();
  limparCacheCora();
});

usarBancoDeTeste();

function acessoDe(empresaId: string, usuarioId: string): Acesso {
  return {
    usuarioId,
    nome: "Dono Teste",
    email: "dono@exemplo.test",
    empresaId,
    nomeEmpresa: "Casa",
    cnpjEmpresa: "00000000000000",
    papel: "DONO",
    superadministrador: false,
  };
}

async function dono(sufixo: string) {
  const empresa = await criarEmpresaDeTeste({ nomeFantasia: `Cora ${sufixo}`, cnpj: completarCnpj(sufixo) });
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Dono",
      email: `dono-${sufixo}@exemplo.test`,
      senhaHash: "hash-teste",
      empresaId: empresa.id,
      papel: "DONO",
    },
  });
  return { empresa, usuario, acesso: acessoDe(empresa.id, usuario.id) };
}

function pagador() {
  return {
    nome: "Cliente Cora Ltda",
    cpfCnpj: completarCnpj("940000000002"),
    tipoPessoa: "JURIDICA" as const,
    email: "cliente@exemplo.test",
    endereco: "Rua das Flores",
    numero: "100",
    bairro: "Centro",
    cidade: "Santos",
    uf: "SP",
    cep: "11010000",
  };
}

describe("ambiente da Cora", () => {
  it("aponta para o Stage e só usa produção com a flag", () => {
    expect(baseCora()).toBe(URL_STAGE_CORA);
    process.env.CORA_API_BASE = URL_PRODUCAO_CORA;
    expect(baseCora()).toBe(URL_STAGE_CORA);
    process.env.CORA_AMBIENTE = "producao";
    expect(baseCora()).toBe(URL_PRODUCAO_CORA);
    process.env.CORA_API_BASE = URL_STAGE_CORA;
    expect(baseCora()).toBe(URL_STAGE_CORA);
  });

  it("pede só o escopo invoice e a redirect URI cadastrada", () => {
    const estado = "estado-de-teste-cora-stage-01";
    const url = new URL(urlAutorizacaoCora(estado));
    expect(url.origin).toBe(URL_STAGE_CORA);
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scopes")).toBe("invoice");
    expect(url.searchParams.get("state")).toBe(estado);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_PADRAO_CORA);
    expect(url.searchParams.get("client_id")).toBe("app-parceiro-teste");
    expect(url.search).not.toMatch(/payment|transfer|account/i);
    expect(url.search).not.toContain("segredo-parceiro-teste");
  });
});

describe("fatura da Cora", () => {
  it("manda Idempotency-Key, boleto com Pix e não repete a cobrança na memória", async () => {
    const pedidos: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
    const transporte: TransporteCora = async (pedido) => {
      pedidos.push(pedido);
      if (pedido.method === "POST") {
        return {
          status: 200,
          body: JSON.stringify({
            id: "inv_http_1",
            status: "OPEN",
            total_amount: 1500,
            total_paid: 0,
            code: "codigo",
            payment_terms: { due_date: "2026-12-20" },
            payment_options: {
              bank_slip: { digitable: "123", barcode: "456", url: "https://api.stage.cora.com.br/boleto.pdf" },
            },
            pix: { emv: "pix-copia" },
            services: [{ description: "Mensalidade" }],
          }),
        };
      }
      return { status: 204, body: "" };
    };
    const cliente = criarClienteHttpCora(async () => "token-de-teste", transporte);
    const chave = "3360a2cf-f300-4f12-bca3-0dd19839a5ab";
    const criada = await cliente.criarFatura({
      idempotencyKey: chave,
      codigo: "fatura-1",
      valor: "15.00",
      vencimento: "2026-12-20",
      descricao: "Mensalidade",
      pagador: pagador(),
    });
    expect(criada.status).toBe("OPEN");
    expect(criada.pixCopiaCola).toBe("pix-copia");
    expect(pedidos[0]?.headers["idempotency-key"]).toBe(chave);
    expect(pedidos[0]?.headers.authorization).toBe("Bearer token-de-teste");
    const corpo = JSON.parse(pedidos[0]?.body ?? "{}") as { payment_forms?: string[]; services?: { amount: number }[] };
    expect(corpo.payment_forms).toEqual(["BANK_SLIP", "PIX"]);
    expect(corpo.services?.[0]?.amount).toBe(1500);
    await cliente.criarFatura({
      idempotencyKey: chave,
      codigo: "fatura-1",
      valor: "15.00",
      vencimento: "2026-12-20",
      pagador: pagador(),
    });
    expect(pedidos[1]?.headers["idempotency-key"]).toBe(chave);

    const memoria = new CoraMemoria();
    const adaptador = criarAdaptadorCora(memoria);
    const primeira = await adaptador.criarCobranca({
      idClienteExterno: "cli",
      formaCobranca: "BOLETO_PIX",
      valor: "15.00",
      vencimento: "2026-12-20",
      chaveIdempotencia: chave,
      pagador: pagador(),
    });
    const segunda = await adaptador.criarCobranca({
      idClienteExterno: "cli",
      formaCobranca: "BOLETO_PIX",
      valor: "15.00",
      vencimento: "2026-12-20",
      chaveIdempotencia: chave,
      pagador: pagador(),
    });
    expect(segunda.idExterno).toBe(primeira.idExterno);
    expect(memoria.faturas.size).toBe(1);
    memoria.marcar(primeira.idExterno, "PAID", "2026-12-18");
    expect((await adaptador.consultarCobranca(primeira.idExterno)).status).toBe("PAGO");
    memoria.marcar(primeira.idExterno, "OPEN");
    await adaptador.cancelarCobranca(primeira.idExterno);
    expect((await adaptador.consultarCobranca(primeira.idExterno)).status).toBe("CANCELADO");
    expect(lerFaturaCora({ id: "inv_x", status: "CANCELED", total_amount: 500, payment_terms: { due_date: "2026-12-01" } }).status).toBe(
      "CANCELED",
    );
  });

  it("recusa boleto abaixo de R$ 5", () => {
    expect(() =>
      corpoFaturaCora({
        idempotencyKey: "3360a2cf-f300-4f12-bca3-0dd19839a5ab",
        codigo: "fatura-1",
        valor: "4.00",
        vencimento: "2026-12-20",
        pagador: pagador(),
      }),
    ).toThrow(/R\$ 5,00/);
  });
});

describe("OAuth da Cora", () => {
  it("manda na autorização o mesmo state do cookie e do banco", async () => {
    const casa = await dono("940000000051");
    const iniciado = await iniciarOauthCora(casa.acesso);
    const estado = estadoDoCookie(iniciado.cookie);
    const url = new URL(iniciado.url);
    expect(url.origin).toBe(URL_STAGE_CORA);
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("state")).toBe(estado);
    expect(url.searchParams.get("scopes")).toBe("invoice");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_PADRAO_CORA);
    expect(url.search).not.toMatch(/payment|transfer|account/i);
    expect(url.search).not.toContain("segredo-parceiro-teste");
    const linha = await prisma.estadoOauth.findFirstOrThrow({
      where: { empresaId: casa.empresa.id, usuarioId: casa.usuario.id, provedor: "CORA" },
    });
    expect(linha.estadoHash).toBe(hashEstadoOauth(estado));
    expect(linha.estadoHash).not.toBe(estado);
  });

  it("conclui o callback quando a Cora devolve code e state", async () => {
    const casa = await dono("940000000052");
    const iniciado = await iniciarOauthCora(casa.acesso);
    const estado = estadoDoCookie(iniciado.cookie);
    await entrar(casa, iniciado.cookie);
    const fetchToken = instalarFetchToken();
    try {
      const resposta = await callbackCora(
        new Request(urlCallback({ code: CODIGO_CORA, state: estado, session_state: "session-state-interno-cora" })),
      );
      const destino = new URL(resposta.headers.get("location") ?? "");
      expect(destino.pathname).toBe("/banco");
      expect(destino.searchParams.get("cora")).toBe("conectado_sem_webhook");
    } finally {
      fetchToken.restaurar();
    }
    expect(fetchToken.chamadas).toHaveLength(1);
    expect(fetchToken.chamadas[0]?.url).toBe(`${URL_STAGE_CORA}/oauth/token`);
    const corpo = new URLSearchParams(fetchToken.chamadas[0]?.body ?? "");
    expect(corpo.get("grant_type")).toBe("authorization_code");
    expect(corpo.get("code")).toBe(CODIGO_CORA);
    expect(corpo.get("redirect_uri")).toBe(REDIRECT_PADRAO_CORA);
    expect(fetchToken.chamadas[0]?.body).not.toContain("segredo-parceiro-teste");
    expect(fetchToken.chamadas[0]?.body).not.toContain("session-state-interno-cora");
    const linha = await prisma.configuracaoPagamento.findFirstOrThrow({ where: { empresaId: casa.empresa.id, provedor: "CORA" } });
    expect(linha.credenciaisCifradas).not.toContain("access-da-conta");
    expect(linha.credenciaisCifradas).not.toContain("refresh-da-conta");
    expect(linha.ambiente).toBe("SANDBOX");
    expect(await prisma.estadoOauth.count({ where: { empresaId: casa.empresa.id } })).toBe(0);
  });

  it("conclui o callback quando a Cora devolve só code e session_state e o cookie assinado vale", async () => {
    const casa = await dono("940000000053");
    const iniciado = await iniciarOauthCora(casa.acesso);
    await entrar(casa, iniciado.cookie);
    const fetchToken = instalarFetchToken();
    try {
      const resposta = await callbackCora(
        new Request(urlCallback({ code: CODIGO_CORA, session_state: "session-state-interno-cora" })),
      );
      const destino = new URL(resposta.headers.get("location") ?? "");
      expect(destino.pathname).toBe("/banco");
      expect(destino.searchParams.get("cora")).toBe("conectado_sem_webhook");
      const deNovo = await callbackCora(
        new Request(urlCallback({ code: CODIGO_CORA, session_state: "session-state-interno-cora" })),
      );
      expect(new URL(deNovo.headers.get("location") ?? "").searchParams.get("cora")).toBe("erro");
    } finally {
      fetchToken.restaurar();
    }
    expect(fetchToken.chamadas).toHaveLength(1);
    const corpo = new URLSearchParams(fetchToken.chamadas[0]?.body ?? "");
    expect(corpo.get("code")).toBe(CODIGO_CORA);
    expect(corpo.get("redirect_uri")).toBe(new URL(iniciado.url).searchParams.get("redirect_uri"));
    expect(corpo.get("redirect_uri")).toBe(REDIRECT_PADRAO_CORA);
    expect(fetchToken.chamadas[0]?.body ?? "").not.toContain("session-state-interno-cora");
    expect(await prisma.estadoOauth.count({ where: { empresaId: casa.empresa.id } })).toBe(0);
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: casa.empresa.id } });
    expect(empresa.provedorPagamento).toBe("CORA");
  });

  it("não troca o código se o state devolvido não é o do cookie", async () => {
    const casa = await dono("940000000054");
    const iniciado = await iniciarOauthCora(casa.acesso);
    let chamadas = 0;
    const transporte: TransporteCora = async () => {
      chamadas += 1;
      return { status: 200, body: "{}" };
    };
    await expect(
      concluirOauthCora({
        acesso: casa.acesso,
        code: CODIGO_CORA,
        state: "outro-state-que-nao-confere-com-o-cookie",
        cookie: iniciado.cookie,
        transporte,
      }),
    ).rejects.toMatchObject({ status: 400, codigo: "cora_oauth" });
    expect(chamadas).toBe(0);
    expect(await prisma.estadoOauth.count({ where: { empresaId: casa.empresa.id } })).toBe(1);
    expect(await prisma.configuracaoPagamento.count({ where: { empresaId: casa.empresa.id } })).toBe(0);
  });

  it("não conclui sem o cookie assinado", async () => {
    const casa = await dono("940000000056");
    await iniciarOauthCora(casa.acesso);
    let chamadas = 0;
    const transporte: TransporteCora = async () => {
      chamadas += 1;
      return { status: 200, body: "{}" };
    };
    await expect(
      concluirOauthCora({
        acesso: casa.acesso,
        code: CODIGO_CORA,
        state: null,
        cookie: null,
        transporte,
      }),
    ).rejects.toMatchObject({ status: 400, codigo: "cora_oauth" });
    expect(chamadas).toBe(0);
    expect(await prisma.estadoOauth.count({ where: { empresaId: casa.empresa.id } })).toBe(1);
  });

  it("manda para o login se a sessão não volta no callback", async () => {
    const casa = await dono("940000000055");
    const iniciado = await iniciarOauthCora(casa.acesso);
    jarOauth.clear();
    jarOauth.set(COOKIE_OAUTH_CORA, iniciado.cookie);
    const fetchToken = instalarFetchToken();
    try {
      const resposta = await callbackCora(
        new Request(urlCallback({ code: CODIGO_CORA, session_state: "session-state-interno-cora" })),
      );
      const destino = new URL(resposta.headers.get("location") ?? "");
      expect(destino.pathname).toBe("/login");
      expect(destino.searchParams.get("next")).toBe("/banco");
    } finally {
      fetchToken.restaurar();
    }
    expect(fetchToken.chamadas).toHaveLength(0);
    expect(await prisma.estadoOauth.count({ where: { empresaId: casa.empresa.id } })).toBe(1);
    expect(await prisma.configuracaoPagamento.count({ where: { empresaId: casa.empresa.id } })).toBe(0);
  });

  it("não troca o código se o state não é da mesma empresa e sessão", async () => {
    const casa = await dono("940000000011");
    const outra = await dono("940000000012");
    const iniciado = await iniciarOauthCora(casa.acesso);
    let chamadas = 0;
    const transporte: TransporteCora = async () => {
      chamadas += 1;
      return { status: 200, body: "{}" };
    };
    await expect(
      concluirOauthCora({
        acesso: outra.acesso,
        code: "codigo-autorizacao-valido",
        state: estadoDoCookie(iniciado.cookie),
        cookie: iniciado.cookie,
        transporte,
      }),
    ).rejects.toMatchObject({ status: 403, codigo: "cora_oauth" });
    expect(chamadas).toBe(0);
    expect(await prisma.configuracaoPagamento.count({ where: { provedor: "CORA" } })).toBe(0);
  });

  it("grava os tokens cifrados e não repete um state já usado", async () => {
    const casa = await dono("940000000013");
    const iniciado = await iniciarOauthCora(casa.acesso);
    const transporte = transporteDeToken();
    const primeiro = await concluirOauthCora({
      acesso: casa.acesso,
      code: "codigo-autorizacao-valido",
      state: estadoDoCookie(iniciado.cookie),
      cookie: iniciado.cookie,
      transporte: transporte.fn,
    });
    expect(primeiro.webhook).toBe("pendente");
    const linha = await prisma.configuracaoPagamento.findFirstOrThrow({ where: { empresaId: casa.empresa.id, provedor: "CORA" } });
    expect(linha.credenciaisCifradas).not.toContain("access-da-conta");
    expect(linha.credenciaisCifradas).not.toContain("refresh-da-conta");
    expect(linha.ambiente).toBe("SANDBOX");
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: casa.empresa.id } });
    expect(empresa.provedorPagamento).toBe("CORA");
    await expect(
      concluirOauthCora({
        acesso: casa.acesso,
        code: "codigo-autorizacao-valido",
        state: estadoDoCookie(iniciado.cookie),
        cookie: iniciado.cookie,
        transporte: transporte.fn,
      }),
    ).rejects.toMatchObject({ codigo: "cora_oauth" });
    expect(transporte.chamadas).toBe(1);
  });

  it("não grava token quando a troca falha", async () => {
    const casa = await dono("940000000014");
    const iniciado = await iniciarOauthCora(casa.acesso);
    const transporte: TransporteCora = async () => ({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    await expect(
      concluirOauthCora({
        acesso: casa.acesso,
        code: "codigo-ruim",
        state: estadoDoCookie(iniciado.cookie),
        cookie: iniciado.cookie,
        transporte,
      }),
    ).rejects.toMatchObject({ codigo: "cora_auth" });
    expect(await prisma.configuracaoPagamento.count({ where: { empresaId: casa.empresa.id } })).toBe(0);
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: casa.empresa.id } });
    expect(empresa.provedorPagamento).toBe("ASAAS");
  });
});

describe("emissão e webhook", () => {
  async function clientePronto(cnpj: string) {
    const casa = await dono(cnpj);
    await prisma.empresa.update({ where: { id: casa.empresa.id }, data: { provedorPagamento: "CORA" } });
    const cliente = await prisma.cliente.create({
      data: {
        empresaId: casa.empresa.id,
        nomeFantasia: "Cliente",
        razaoSocial: "Cliente Cora Ltda",
        documento: completarCnpj("940000000099"),
        tipoDocumento: "CNPJ",
        segmento: "OUTRO",
        contatoNome: "Ana",
        whatsapp: "13988881001",
        email: `ana-${cnpj}@exemplo.test`,
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
        enderecoCobranca: "Rua A",
        numeroCobranca: "10",
        bairroCobranca: "Centro",
        cepCobranca: "11010000",
      },
    });
    return { ...casa, cliente };
  }

  it("persiste o UUID e o retry não cria outro boleto", async () => {
    const { acesso, cliente } = await clientePronto("940000000021");
    const memoria = new CoraMemoria();
    memoria.falharCriacao = true;
    await expect(
      emitirFaturaCora(acesso, cliente.id, { valor: "15.00", vencimento: "2026-12-20", chaveIdempotencia: "cobranca-cora-0001" }, memoria),
    ).rejects.toMatchObject({ status: 504 });
    const reservada = await prisma.fatura.findFirstOrThrow({ where: { clienteId: cliente.id } });
    expect(reservada.status).toBe("CRIANDO");
    expect(reservada.idempotencyKeyCora).toMatch(/^[0-9a-f-]{36}$/i);
    const chave = reservada.idempotencyKeyCora;
    await prisma.$executeRaw`UPDATE "faturas" SET "atualizado_em" = ${new Date(Date.now() - 3 * 60 * 1000)} WHERE "id" = ${reservada.id}`;
    memoria.falharCriacao = false;
    const emitida = await emitirFaturaCora(
      acesso,
      cliente.id,
      { valor: "15.00", vencimento: "2026-12-20", chaveIdempotencia: "cobranca-cora-0001" },
      memoria,
    );
    expect(memoria.faturas.size).toBe(1);
    const gravada = await prisma.fatura.findUniqueOrThrow({ where: { id: emitida.id } });
    expect(gravada.idExterno).toBe(memoria.chaves.get(chave ?? ""));
    expect(emitida.status).toBe("OPEN");
    expect(emitida.pixCopiaCola).toContain("pix");
    const cancelada = await cancelarFaturaCora(acesso, emitida.id, memoria);
    expect(cancelada.status).toBe("CANCELLED");
    expect(cancelada.excluida).toBe(true);
  });

  it("não marca paga pelo aviso e isola a outra empresa", async () => {
    const casa = await clientePronto("940000000031");
    const vizinha = await clientePronto("940000000032");
    const memoria = new CoraMemoria();
    const criada = await memoria.criarFatura({
      idempotencyKey: "3360a2cf-f300-4f12-bca3-0dd19839a5ab",
      codigo: "fat",
      valor: "15.00",
      vencimento: "2026-12-20",
      pagador: pagador(),
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId: casa.empresa.id,
        clienteId: casa.cliente.id,
        provedor: "CORA",
        idExterno: criada.id,
        valor: "15.00",
        vencimento: new Date("2026-12-20T00:00:00.000Z"),
        status: "OPEN",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });
    const daVizinha = await prisma.fatura.create({
      data: {
        empresaId: vizinha.empresa.id,
        clienteId: vizinha.cliente.id,
        provedor: "CORA",
        idExterno: "inv_da_vizinha",
        valor: "20.00",
        vencimento: new Date("2026-12-20T00:00:00.000Z"),
        status: "OPEN",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });
    process.env.CORA_WEBHOOK_SEGREDO = "segredo-webhook-cora-stage-01";
    const avisos = new Headers({
      "user-agent": "Cora-Webhook",
      "webhook-event-id": "evt_pago_1",
      "webhook-event-type": "invoice.paid",
      "webhook-resource-id": criada.id,
    });
    await processarWebhookCora("segredo-webhook-cora-stage-01", avisos, { clienteDe: async () => memoria });
    const aberta = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(aberta.statusNormalizado).toBe("PENDENTE");
    expect(aberta.status).toBe("OPEN");
    expect(memoria.consultas).toBe(1);
    const outra = await prisma.fatura.findUniqueOrThrow({ where: { id: daVizinha.id } });
    expect(outra.status).toBe("OPEN");
    expect(await prisma.eventoPagamento.count()).toBe(1);

    memoria.marcar(criada.id, "PAID", "2026-12-19");
    const deNovo = new Headers(avisos);
    deNovo.set("webhook-event-id", "evt_pago_2");
    await processarWebhookCora("segredo-webhook-cora-stage-01", deNovo, { clienteDe: async () => memoria });
    const paga = await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(paga.status).toBe("PAID");
    expect(paga.statusNormalizado).toBe("PAGO");
    expect(paga.pagoEm?.toISOString().slice(0, 10)).toBe("2026-12-19");
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: daVizinha.id } })).statusNormalizado).toBe("PENDENTE");

    await processarWebhookCora("segredo-webhook-cora-stage-01", deNovo, { clienteDe: async () => memoria });
    expect(await prisma.eventoPagamento.count({ where: { idEventoExterno: "evt_pago_2" } })).toBe(1);
  });

  it("não altera a fatura se a consulta falha e recusa segredo ou empresa alheia", async () => {
    const casa = await clientePronto("940000000041");
    const vizinha = await clientePronto("940000000042");
    const memoria = new CoraMemoria();
    const criada = await memoria.criarFatura({
      idempotencyKey: "4460a2cf-f300-4f12-bca3-0dd19839a5ab",
      codigo: "fat",
      valor: "15.00",
      vencimento: "2026-12-20",
      pagador: pagador(),
    });
    const fatura = await prisma.fatura.create({
      data: {
        empresaId: casa.empresa.id,
        clienteId: casa.cliente.id,
        provedor: "CORA",
        idExterno: criada.id,
        valor: "15.00",
        vencimento: new Date("2026-12-20T00:00:00.000Z"),
        status: "OPEN",
        statusNormalizado: "PENDENTE",
        formaCobranca: "BOLETO",
      },
    });
    process.env.CORA_WEBHOOK_SEGREDO = "segredo-webhook-cora-stage-01";
    memoria.falharConsulta = true;
    const headers = new Headers({
      "user-agent": "Cora-Webhook",
      "webhook-event-id": "evt_falha",
      "webhook-event-type": "invoice.canceled",
      "webhook-resource-id": criada.id,
    });
    await expect(processarWebhookCora("segredo-webhook-cora-stage-01", headers, { clienteDe: async () => memoria })).rejects.toMatchObject({
      status: 503,
      codigo: "webhook_indisponivel",
    });
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).status).toBe("OPEN");
    expect(await prisma.eventoPagamento.count()).toBe(0);
    await expect(processarWebhookCora("segredo-que-nao-bate-000000", headers)).rejects.toMatchObject({ status: 401 });
    await expect(cancelarFaturaCora(vizinha.acesso, fatura.id, memoria)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.fatura.findUniqueOrThrow({ where: { id: fatura.id } })).excluida).toBe(false);
  });
});

async function entrar(
  casa: { empresa: { id: string }; usuario: { id: string; email: string; nome: string } },
  cookieOauth: string,
) {
  jarOauth.clear();
  jarOauth.set(
    COOKIE_SESSAO,
    await emitirToken({
      sub: casa.usuario.id,
      email: casa.usuario.email,
      nome: casa.usuario.nome,
      empresaId: casa.empresa.id,
      papel: "DONO",
      superadministrador: false,
    }),
  );
  jarOauth.set(COOKIE_OAUTH_CORA, cookieOauth);
}

function urlCallback(params: Record<string, string>): string {
  const url = new URL("https://gestao-cobranca-beta.vercel.app/api/integracoes/cora/callback");
  for (const [chave, valor] of Object.entries(params)) url.searchParams.set(chave, valor);
  return url.toString();
}

function instalarFetchToken() {
  const chamadas: { url: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    chamadas.push({ url, body });
    const campos = new URLSearchParams(body);
    if (url !== `${URL_STAGE_CORA}/oauth/token` || campos.get("grant_type") !== "authorization_code") {
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }
    if (campos.get("redirect_uri") !== REDIRECT_PADRAO_CORA || campos.get("code") !== CODIGO_CORA) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    const autorizacao = new Headers(init?.headers).get("authorization") ?? "";
    const decodificado = Buffer.from(autorizacao.slice("Basic ".length), "base64").toString("utf8");
    if (decodificado !== `${process.env.CORA_CLIENT_ID}:${process.env.CORA_CLIENT_SECRET}`) {
      return new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 });
    }
    return new Response(
      JSON.stringify({
        access_token: "access-da-conta",
        refresh_token: "refresh-da-conta",
        expires_in: 86400,
        token_type: "Bearer",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return {
    chamadas,
    restaurar() {
      globalThis.fetch = original;
    },
  };
}

function estadoDoCookie(cookie: string): string {
  const meio = cookie.split(".")[1] ?? "";
  const json = JSON.parse(Buffer.from(meio, "base64url").toString("utf8")) as { estado?: string };
  if (!json.estado) throw new Error("cookie sem estado");
  return json.estado;
}

function transporteDeToken(): { fn: TransporteCora; chamadas: number } {
  const estado = { chamadas: 0 };
  const fn: TransporteCora = async (pedido) => {
    estado.chamadas += 1;
    expect(pedido.url).toBe(`${URL_STAGE_CORA}/oauth/token`);
    expect(pedido.headers.authorization?.startsWith("Basic ")).toBe(true);
    expect(pedido.body).toContain("grant_type=authorization_code");
    expect(pedido.body).toContain("redirect_uri=");
    expect(pedido.body).not.toContain("segredo-parceiro-teste");
    return {
      status: 200,
      body: JSON.stringify({
        access_token: "access-da-conta",
        refresh_token: "refresh-da-conta",
        expires_in: 86400,
        token_type: "Bearer",
      }),
    };
  };
  return { fn, get chamadas() { return estado.chamadas; } };
}
