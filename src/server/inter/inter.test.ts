import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { statusBrutos, statusNormalizado } from "@/lib/status-pagamento";
import { criarAdaptadorInter } from "@/server/pagamentos/adaptador-inter";
import { confirmarEventoParaBaixa } from "@/server/pagamentos/baixa";
import { CAPACIDADES_INTER, usaRecorrenciaPropria, precisaReconsultarAntesDeBaixar } from "@/server/pagamentos/capacidades";
import { normalizarWebhookInter } from "@/server/pagamentos/webhook-inter";
import { avancarMes, deveEmitirRecorrencia, chaveRecorrencia } from "./calendario";
import { limparCacheTokenInter, criarClienteHttpInter } from "./cliente-http";
import { InterMemoria } from "./memoria";
import { seuNumeroDe } from "./seu-numero";
import type { CredenciaisInter } from "./contrato";

const PAGADOR = {
  nome: "Ana Exemplo",
  cpfCnpj: "12345678901",
  tipoPessoa: "FISICA" as const,
  endereco: "Rua das Flores",
  numero: "10",
  bairro: "Centro",
  cidade: "Santos",
  uf: "SP",
  cep: "11010000",
};

describe("status do Inter", () => {
  it("traduz as situações da cobrança v3 para o vocabulário do Taguaro", () => {
    expect(statusNormalizado("A_RECEBER", "INTER")).toBe("PENDENTE");
    expect(statusNormalizado("ATRASADO", "INTER")).toBe("VENCIDO");
    expect(statusNormalizado("PROTESTO", "INTER")).toBe("VENCIDO");
    expect(statusNormalizado("RECEBIDO", "INTER")).toBe("PAGO");
    expect(statusNormalizado("MARCADO_RECEBIDO", "INTER")).toBe("PAGO");
    expect(statusNormalizado("CANCELADO", "INTER")).toBe("CANCELADO");
    expect(statusNormalizado("EXPIRADO", "INTER")).toBe("CANCELADO");
    expect(statusNormalizado("EM_PROCESSAMENTO", "INTER")).toBe("CRIANDO");
    expect(statusNormalizado("FALHA_EMISSAO", "INTER")).toBe("FALHA");
    expect(statusBrutos("REGUA_ABERTA", "INTER")).toEqual(["A_RECEBER", "ATRASADO", "PROTESTO"]);
    expect(statusBrutos("PAGO")).toEqual(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
  });

  it("declara bolepix sem assinatura, sem visualização e sem webhook assinado", () => {
    expect(CAPACIDADES_INTER.visualizacao).toBe(false);
    expect(CAPACIDADES_INTER.assinaturaNativa).toBe(false);
    expect(CAPACIDADES_INTER.boletoComPix).toBe(true);
    expect(CAPACIDADES_INTER.webhookAssinado).toBe(false);
    expect(usaRecorrenciaPropria(CAPACIDADES_INTER)).toBe(true);
    expect(precisaReconsultarAntesDeBaixar(CAPACIDADES_INTER)).toBe(true);
  });
});

describe("seuNumero", () => {
  it("é estável, cabe em 15 caracteres e não muda se a chave já é curta", () => {
    expect(seuNumeroDe("abc123")).toBe("ABC123");
    const longo = seuNumeroDe("rec-clh1234567890abcdef-2026-12-10");
    expect(longo).toHaveLength(15);
    expect(seuNumeroDe("rec-clh1234567890abcdef-2026-12-10")).toBe(longo);
    expect(longo).toMatch(/^[A-Z0-9]+$/);
  });
});

describe("recorrência própria", () => {
  it("gera no mês quando o vencimento entra na antecedência e avança um mês", () => {
    expect(deveEmitirRecorrencia("2026-11-10", "2026-11-03", 7)).toBe(true);
    expect(deveEmitirRecorrencia("2026-11-20", "2026-11-03", 0)).toBe(false);
    expect(avancarMes("2026-11-10", 10)).toBe("2026-12-10");
    expect(avancarMes("2026-01-31", 31)).toBe("2026-02-28");
    expect(chaveRecorrencia("abc", "2026-12-10")).toBe("rec-abc-2026-12-10");
  });
});

describe("adaptador Inter em memória", () => {
  it("cria uma vez só, devolve linha, Pix e PDF, consulta e cancela", async () => {
    const memoria = new InterMemoria();
    const adaptador = criarAdaptadorInter(memoria);
    const criada = await adaptador.criarCobranca({
      idClienteExterno: "cli_1",
      formaCobranca: "BOLETO",
      valor: "25.00",
      vencimento: "2026-12-01",
      chaveIdempotencia: "fatura-1",
      descricao: "Mensalidade",
      pagador: PAGADOR,
    });
    expect(criada.status).toBe("PENDENTE");
    expect(criada.statusBruto).toBe("A_RECEBER");
    expect(criada.linhaDigitavel).toContain("34191");
    expect(criada.pixCopiaCola).toContain("BR.GOV.BCB.PIX");
    const deNovo = await adaptador.criarCobranca({
      idClienteExterno: "cli_1",
      formaCobranca: "BOLETO_PIX",
      valor: "25.00",
      vencimento: "2026-12-01",
      chaveIdempotencia: "fatura-1",
      pagador: PAGADOR,
    });
    expect(deNovo.idExterno).toBe(criada.idExterno);
    expect(memoria.cobrancas).toHaveLength(1);
    expect((await adaptador.obterPdf?.(criada.idExterno))?.length).toBeGreaterThan(10);
    await adaptador.cancelarCobranca(criada.idExterno, "Pedido do cliente");
    expect((await adaptador.consultarCobranca(criada.idExterno)).status).toBe("CANCELADO");
    await expect(
      adaptador.criarCobranca({
        idClienteExterno: "cli_1",
        formaCobranca: "CARTAO",
        valor: "25.00",
        vencimento: "2026-12-01",
        chaveIdempotencia: "cartao",
        pagador: PAGADOR,
      }),
    ).rejects.toMatchObject({ codigo: "forma_indisponivel" });
  });

  it("só baixa o webhook quando a consulta confirma o mesmo status", async () => {
    const memoria = new InterMemoria();
    const adaptador = criarAdaptadorInter(memoria);
    const criada = await adaptador.criarCobranca({
      idClienteExterno: "cli_1",
      formaCobranca: "BOLETO",
      valor: "40.00",
      vencimento: "2026-12-05",
      chaveIdempotencia: "fatura-paga",
      pagador: PAGADOR,
    });
    const aviso = {
      codigoSolicitacao: criada.idExterno,
      seuNumero: "FATURAPAGA",
      situacao: "RECEBIDO",
      dataHoraSituacao: "2026-12-05T15:00:00.000Z",
      valorTotalRecebido: "40.00",
      origemRecebimento: "PIX",
    };
    const [evento] = await adaptador.normalizarWebhook({ headers: new Headers(), corpo: [aviso] });
    expect(evento?.status).toBe("PAGO");
    expect(evento?.confirmaPagamento).toBe(true);

    const cedo = await confirmarEventoParaBaixa(adaptador, evento!);
    expect(cedo.baixar).toBe(false);
    expect(cedo.consultou).toBe(true);
    expect(cedo.evento.status).toBe("PENDENTE");

    memoria.marcar(criada.idExterno, "RECEBIDO", "2026-12-05");
    const confirmado = await confirmarEventoParaBaixa(adaptador, evento!);
    expect(confirmado).toMatchObject({ baixar: true, consultou: true });

    memoria.falharConsulta = true;
    const falha = await confirmarEventoParaBaixa(adaptador, evento!);
    expect(falha).toMatchObject({ baixar: false, consultou: true });
  });
});

describe("cliente HTTP do Inter com transporte falso", () => {
  const credenciais: CredenciaisInter = {
    ambiente: "SANDBOX",
    clientId: "client-teste",
    clientSecret: "segredo-teste",
    certificadoPem: "cert",
    chavePrivadaPem: "key",
    contaCorrente: "1234567",
  };

  it("guarda o token, manda a conta corrente e não repete o OAuth", async () => {
    limparCacheTokenInter();
    const chamadas: string[] = [];
    let agora = Date.parse("2026-11-03T12:00:00.000Z");
    const cliente = criarClienteHttpInter(
      credenciais,
      async (pedido) => {
        chamadas.push(`${pedido.method} ${pedido.url}`);
        expect(pedido.cert).toBe("cert");
        expect(pedido.key).toBe("key");
        if (pedido.url.endsWith("/oauth/v2/token")) {
          expect(pedido.headers["x-conta-corrente"]).toBeUndefined();
          expect(pedido.body).toContain("grant_type=client_credentials");
          expect(pedido.body).toContain("boleto-cobranca.read");
          return { status: 200, body: JSON.stringify({ access_token: "tok-1", expires_in: 3600, token_type: "Bearer" }) };
        }
        expect(pedido.headers.Authorization).toBe("Bearer tok-1");
        expect(pedido.headers["x-conta-corrente"]).toBe("1234567");
        if (pedido.method === "GET" && pedido.url.includes("seuNumero=")) {
          return { status: 200, body: JSON.stringify({ cobrancas: [], totalPaginas: 1, ultimaPagina: true }) };
        }
        if (pedido.method === "POST") {
          const corpo = JSON.parse(pedido.body ?? "{}") as { seuNumero?: string };
          expect(corpo.seuNumero).toBe("FATURA1");
          expect(pedido.body).not.toContain("segredo-teste");
          return { status: 200, body: JSON.stringify({ codigoSolicitacao: "cod-1" }) };
        }
        if (pedido.url.endsWith("/cod-1")) {
          return {
            status: 200,
            body: JSON.stringify({
              cobranca: {
                codigoSolicitacao: "cod-1",
                seuNumero: "FATURA1",
                situacao: "A_RECEBER",
                dataVencimento: "2026-12-01",
                valorNominal: 25,
              },
              boleto: { linhaDigitavel: "linha", codigoBarras: "barras" },
              pix: { pixCopiaECola: "pix" },
            }),
          };
        }
        return { status: 500, body: "" };
      },
      () => agora,
    );

    const criada = await cliente.criarCobranca({
      seuNumero: "FATURA1",
      valorNominal: "25.00",
      dataVencimento: "2026-12-01",
      pagador: PAGADOR,
    });
    expect(criada.linhaDigitavel).toBe("linha");
    expect(criada.pixCopiaCola).toBe("pix");
    agora += 60_000;
    await cliente.consultarCobranca("cod-1");
    const tokens = chamadas.filter((item) => item.includes("/oauth/v2/token"));
    expect(tokens).toHaveLength(1);
    expect(createHash("sha256").update("tok-1").digest("hex")).not.toBe("");
  });
});

describe("webhook normalizado", () => {
  it("lê a lista que o Inter envia e ignora item sem código", () => {
    const eventos = normalizarWebhookInter([
      {
        codigoSolicitacao: "cod-2",
        situacao: "CANCELADO",
        dataHoraSituacao: "2026-11-03T10:00:00-03:00",
        origemRecebimento: "BOLETO",
      },
      { situacao: "RECEBIDO" },
    ]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      idExterno: "cod-2",
      status: "CANCELADO",
      visualizacao: false,
      confirmaPagamento: false,
    });
  });
});
