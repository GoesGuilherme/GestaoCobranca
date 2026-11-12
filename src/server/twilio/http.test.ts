import { describe, expect, it, vi } from "vitest";
import { ErroAplicacao } from "@/server/erros";
import { afirmarHttpTwilioPermitido, criarClienteTwilioHttp } from "./http";

const PAI = { accountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", authToken: "token-pai-de-teste-0001" };
const CONTA = { accountSid: "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", authToken: "token-subconta-teste-0001" };

describe("cliente HTTP da Twilio", () => {
  it("recusa mock em produção e rede fora de produção", async () => {
    expect(() => afirmarHttpTwilioPermitido({ NODE_ENV: "production", TWILIO_MOCK: "true" })).toThrow(ErroAplicacao);
    expect(() => afirmarHttpTwilioPermitido({ NODE_ENV: "test", TWILIO_MOCK: "true" })).toThrow(ErroAplicacao);
    const fetchImpl = vi.fn();
    const cliente = criarClienteTwilioHttp({ fetchImpl, env: { NODE_ENV: "test" } });
    await expect(
      cliente.enviarMensagem(CONTA, {
        de: "whatsapp:+5511999990000",
        para: "whatsapp:+5513988881001",
        contentSid: "HXabc",
        variaveis: { "1": "Ana" },
        statusCallback: "https://taguaro.test/api/webhooks/twilio",
      }),
    ).rejects.toMatchObject({ codigo: "twilio_mock_obrigatorio" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cria a subconta, tenta ISVSubAccount e publica o template como UTILITY", async () => {
    const chamadas: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      chamadas.push({ url, body });
      if (url.endsWith("/Accounts.json")) {
        return new Response(JSON.stringify({ sid: "ACcccccccccccccccccccccccccccccccc", auth_token: "segredo-subconta-gerado" }), {
          status: 201,
        });
      }
      if (url.endsWith("/Channels/Senders") && body.includes("account_type")) {
        return new Response(JSON.stringify({ message: "account_type is not available", code: 400 }), { status: 400 });
      }
      if (url.endsWith("/Channels/Senders")) {
        return new Response(JSON.stringify({ sid: "XEaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "ONLINE", sender_id: "whatsapp:+5511999990000" }), {
          status: 201,
        });
      }
      if (url.endsWith("/Content")) {
        return new Response(JSON.stringify({ sid: "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), { status: 201 });
      }
      if (url.includes("/ApprovalRequests/whatsapp")) {
        return new Response(JSON.stringify({ status: "received", category: "UTILITY" }), { status: 201 });
      }
      return new Response("inesperado", { status: 500 });
    });
    const cliente = criarClienteTwilioHttp({ fetchImpl, env: { NODE_ENV: "production" } });
    const sub = await cliente.criarSubconta(PAI, "Taguaro teste");
    expect(sub.sid.startsWith("AC")).toBe(true);
    expect(JSON.stringify(chamadas)).not.toContain("segredo-subconta-gerado");

    const sender = await cliente.criarSender(CONTA, {
      telefoneE164: "+5511999990000",
      nome: "Empresa",
      wabaId: "123456789012345",
      webhookUrl: "https://taguaro.test/api/webhooks/twilio",
      pedirCoexistencia: true,
    });
    expect(sender.accountTypeAceito).toBe(false);
    expect(sender.sid.startsWith("XE")).toBe(true);
    expect(chamadas.filter((item) => item.url.endsWith("/Channels/Senders"))).toHaveLength(2);

    const template = await cliente.publicarTemplate(CONTA, {
      nome: "taguaro_boleto_gerado_v2",
      idioma: "pt_BR",
      corpo: "Olá, {{1}}. Link {{4}}.",
      variaveisExemplo: { "1": "Ana", "4": "https://www.asaas.com/i/exemplo" },
      categoria: "UTILITY",
    });
    expect(template.sid.startsWith("HX")).toBe(true);
    expect(chamadas.some((item) => item.body.includes('"category":"UTILITY"'))).toBe(true);
    expect(chamadas.some((item) => item.url.includes("graph.facebook.com"))).toBe(false);
  });

  it("envia texto de sessão pela API oficial da Twilio, sem chamar a Meta", async () => {
    const chamadas: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const bruto = init?.body;
      const body = typeof bruto === "string" ? bruto : bruto instanceof URLSearchParams ? bruto.toString() : "";
      chamadas.push({ url, body });
      return new Response(JSON.stringify({ sid: "SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), { status: 201 });
    });
    const cliente = criarClienteTwilioHttp({ fetchImpl, env: { NODE_ENV: "production" } });
    const enviada = await cliente.enviarTexto(CONTA, {
      de: "whatsapp:+5511999990000",
      para: "whatsapp:+5513988881001",
      corpo: "Sua fatura está em aberto.",
      statusCallback: "https://taguaro.test/api/webhooks/twilio",
    });
    expect(enviada.sid.startsWith("SM")).toBe(true);
    expect(chamadas[0]?.url.startsWith("https://api.twilio.com/2010-04-01/Accounts/")).toBe(true);
    expect(chamadas[0]?.url.includes("graph.facebook.com")).toBe(false);
    expect(chamadas[0]?.body.includes("Body=")).toBe(true);
    expect(chamadas[0]?.body.includes("ContentSid")).toBe(false);
  });

  it("busca o token da subconta na conta pai sem colocar o segredo na requisição", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACcccccccccccccccccccccccccccccccc.json");
      return new Response(
        JSON.stringify({
          sid: "ACcccccccccccccccccccccccccccccccc",
          auth_token: "segredo-subconta-buscado",
          status: "active",
          owner_account_sid: PAI.accountSid,
        }),
        { status: 200 },
      );
    });
    const cliente = criarClienteTwilioHttp({ fetchImpl, env: { NODE_ENV: "production" } });
    const sub = await cliente.obterSubconta(PAI, "ACcccccccccccccccccccccccccccccccc");
    expect(sub).toEqual({ sid: "ACcccccccccccccccccccccccccccccccc", authToken: "segredo-subconta-buscado", status: "active" });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("segredo-subconta-buscado");
    await expect(cliente.obterSubconta(PAI, PAI.accountSid)).rejects.toThrow(/conta pai/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("lista ContentAndApprovals da subconta sem enviar mensagem", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? "GET"} ${url}`);
      expect(init?.method ?? "GET").toBe("GET");
      if (url.includes("PageToken=2")) {
        return new Response(
          JSON.stringify({
            contents: [
              {
                sid: "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                account_sid: CONTA.accountSid,
                friendly_name: "pago",
                approval_requests: {
                  status: "rejected",
                  rejection_reason: "texto fora do padrão",
                  category: "UTILITY",
                },
              },
            ],
            meta: { next_page_url: "http://exemplo.invalido/seguir" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          contents: [
            {
              sid: "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              account_sid: CONTA.accountSid,
              friendly_name: "boleto",
              approval_requests: { status: "pending", rejection_reason: "", category: "UTILITY" },
            },
          ],
          meta: { next_page_url: "https://content.twilio.com/v1/ContentAndApprovals?PageSize=1&PageToken=2" },
        }),
        { status: 200 },
      );
    });
    const cliente = criarClienteTwilioHttp({ fetchImpl, env: { NODE_ENV: "production" } });
    const lista = await cliente.listarConteudosComAprovacao(CONTA);
    expect(lista).toEqual([
      {
        sid: "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        aprovacao: "pending",
        motivo: null,
        categoria: "UTILITY",
        nome: "boleto",
      },
      {
        sid: "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        aprovacao: "rejected",
        motivo: "texto fora do padrão",
        categoria: "UTILITY",
        nome: "pago",
      },
    ]);
    expect(urls[0]).toBe("GET https://content.twilio.com/v1/ContentAndApprovals?PageSize=100");
    expect(urls.some((item) => item.includes("Messages.json") || item.includes("exemplo.invalido"))).toBe(false);
    expect(urls.join("\n")).not.toContain(CONTA.authToken);
  });
});
