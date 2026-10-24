import { describe, expect, it } from "vitest";
import { criarClienteHttpAsaas } from "./cliente-http";
import { ErroAsaas, URL_ASAAS } from "./contrato";
import { afirmarMockAsaasPermitido, mockAsaasLigado } from "./fabrica";

const CHAVE = "$aact_hmlg_teste_local_nao_e_uma_chave_real_0001";

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cliente HTTP do Asaas", () => {
  it("chama o sandbox com access_token e não deixa a chave vazar no erro", async () => {
    const pedidos: { url: string; init: RequestInit }[] = [];
    let falhar = false;
    const fetchImpl: typeof fetch = async (entrada, init) => {
      if (falhar) {
        return resposta(400, { errors: [{ description: `falhou ${CHAVE}` }] });
      }
      pedidos.push({ url: String(entrada), init: init ?? {} });
      const url = String(entrada);
      if (url.endsWith("/myAccount")) return resposta(200, { name: "Conta Teste" });
      if (url.includes("/customers?")) return resposta(200, { data: [] });
      if (url.endsWith("/customers")) return resposta(200, { id: "cus_1", name: "Cliente", cpfCnpj: "123" });
      if (url.endsWith("/payments")) {
        return resposta(200, {
          id: "pay_1",
          customer: "cus_1",
          value: 189.9,
          dueDate: "2026-11-15",
          status: "PENDING",
          billingType: "BOLETO",
          bankSlipUrl: "https://sandbox.asaas.com/b/pdf/pay_1",
          invoiceUrl: "https://sandbox.asaas.com/i/pay_1",
        });
      }
      if (url.endsWith("/identificationField")) {
        return resposta(200, { identificationField: "23793" });
      }
      if (url.endsWith("/pixQrCode")) return resposta(404, { errors: [{ description: "sem pix" }] });
      if (url.includes("/payments/pay_1") && init?.method === "DELETE") return resposta(200, { deleted: true, id: "pay_1" });
      return resposta(400, { errors: [{ description: `falhou ${CHAVE}` }] });
    };

    const cliente = criarClienteHttpAsaas({
      baseUrl: URL_ASAAS.SANDBOX,
      apiKey: CHAVE,
      fetchImpl,
    });

    expect((await cliente.testarConexao()).nome).toBe("Conta Teste");
    expect(await cliente.buscarClientePorDocumento("12.3")).toBeNull();
    const criado = await cliente.criarCliente({ nome: "Cliente", cpfCnpj: "123", email: "a@exemplo.test" });
    expect(criado.id).toBe("cus_1");
    const cobranca = await cliente.criarCobranca({
      customer: "cus_1",
      formaCobranca: "BOLETO",
      valor: "189.90",
      vencimento: "2026-11-15",
    });
    expect(cobranca.valor).toBe("189.90");
    expect(await cliente.obterLinhaDigitavel("pay_1")).toBe("23793");
    expect(await cliente.obterPix("pay_1")).toBeNull();
    await cliente.cancelarCobranca("pay_1");
    falhar = true;

    const cabecalhos = pedidos.map((pedido) => new Headers(pedido.init.headers));
    expect(pedidos.every((pedido) => pedido.url.startsWith("https://api-sandbox.asaas.com/v3"))).toBe(true);
    expect(cabecalhos.every((cabecalho) => cabecalho.get("access_token") === CHAVE)).toBe(true);
    expect(cabecalhos.every((cabecalho) => cabecalho.get("user-agent") === "GestaoCobranca")).toBe(true);
    expect(pedidos.some((pedido) => pedido.url.includes("cpfCnpj=123"))).toBe(true);
    const corpoPagamento = String(pedidos.find((pedido) => pedido.url.endsWith("/payments"))?.init.body);
    expect(corpoPagamento).toContain('"billingType":"BOLETO"');
    expect(corpoPagamento).toContain('"value":189.90');
    expect(corpoPagamento).not.toContain('"value":"189.90"');

    await expect(cliente.testarConexao()).rejects.toBeInstanceOf(ErroAsaas);
    try {
      await cliente.testarConexao();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroAsaas);
      expect((erro as Error).message).not.toContain(CHAVE);
      expect((erro as Error).message).toContain("[redigido]");
    }
  });

  it("cria a assinatura mensal com o valor em número e atualiza as pendências", async () => {
    const pedidos: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (entrada, init) => {
      pedidos.push({ url: String(entrada), init: init ?? {} });
      const url = String(entrada);
      if (url.endsWith("/subscriptions") && init?.method === "POST") {
        return resposta(200, {
          id: "sub_1",
          customer: "cus_1",
          value: 150,
          nextDueDate: "2026-11-10",
          cycle: "MONTHLY",
          billingType: "BOLETO",
          status: "ACTIVE",
          description: "Mensalidade Licença",
        });
      }
      if (url.endsWith("/subscriptions/sub_1") && init?.method === "PUT") {
        return resposta(200, {
          id: "sub_1",
          customer: "cus_1",
          value: 180,
          nextDueDate: "2026-12-10",
          cycle: "MONTHLY",
          billingType: "PIX",
          status: "ACTIVE",
        });
      }
      if (url.includes("/subscriptions/sub_1/payments")) {
        return resposta(200, {
          hasMore: false,
          data: [
            {
              id: "pay_sub",
              customer: "cus_1",
              subscription: "sub_1",
              value: 150,
              dueDate: "2026-11-10",
              status: "PENDING",
              billingType: "BOLETO",
            },
          ],
        });
      }
      if (init?.method === "DELETE") return resposta(200, { deleted: true, id: "sub_1" });
      return resposta(404, {});
    };
    const cliente = criarClienteHttpAsaas({ baseUrl: URL_ASAAS.SANDBOX, apiKey: CHAVE, fetchImpl });
    const criada = await cliente.criarAssinatura({
      customer: "cus_1",
      formaCobranca: "BOLETO",
      valor: "150.00",
      proximoVencimento: "2026-11-10",
      descricao: "Mensalidade Licença",
      referencia: "vinculo-1",
      encargos: {
        multaPercentual: "2.00",
        jurosPercentual: "1.15",
        descontoPercentual: "5.00",
        descontoDiasAntes: 3,
      },
    });
    expect(criada.id).toBe("sub_1");
    expect(criada.ciclo).toBe("MONTHLY");
    const corpo = String(pedidos[0]?.init.body);
    expect(corpo).toContain('"cycle":"MONTHLY"');
    expect(corpo).toContain('"value":150.00');
    expect(corpo).toContain('"fine":{"value":2.00,"type":"PERCENTAGE"}');
    expect(corpo).toContain('"interest":{"value":1.15}');
    expect(corpo).toContain('"discount":{"value":5.00,"dueDateLimitDays":3,"type":"PERCENTAGE"}');
    expect(corpo).not.toContain(CHAVE);
    const atualizada = await cliente.atualizarAssinatura("sub_1", {
      valor: "180.00",
      formaCobranca: "PIX",
      proximoVencimento: "2026-12-10",
      atualizarPendentes: true,
      encargos: { multaPercentual: "0.00" },
    });
    expect(atualizada.valor).toBe("180.00");
    const corpoAtualizacao = String(pedidos[1]?.init.body);
    expect(corpoAtualizacao).toContain('"updatePendingPayments":true');
    expect(corpoAtualizacao).toContain('"value":180.00');
    expect(corpoAtualizacao).toContain('"fine":{"value":0.00,"type":"PERCENTAGE"}');
    expect(corpoAtualizacao).not.toContain('"interest"');
    const pagina = await cliente.listarCobrancasDaAssinatura("sub_1", 0, 100);
    expect(pagina.cobrancas[0]?.subscription).toBe("sub_1");
    await cliente.cancelarAssinatura("sub_1");
    expect(pedidos.at(-1)?.init.method).toBe("DELETE");
  });

  it("recusa o modo simulado em produção", () => {
    expect(mockAsaasLigado({ ASAAS_MOCK: "true", NODE_ENV: "production" })).toBe(false);
    expect(mockAsaasLigado({ ASAAS_MOCK: "true", NODE_ENV: "development" })).toBe(true);
    expect(() => afirmarMockAsaasPermitido({ ASAAS_MOCK: "true", NODE_ENV: "production" })).toThrow(
      /produção/,
    );
  });
});
