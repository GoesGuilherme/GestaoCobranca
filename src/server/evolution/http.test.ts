import { describe, expect, it } from "vitest";
import { ErroAplicacao } from "@/server/erros";
import { criarClienteEvolutionHttp, urlEvolutionConfiavel } from "./http";
import { qrDeBase64 } from "./qr";

const CHAVE = "chave-evolution-super-secreta";
const ambiente = {
  NODE_ENV: "production",
  EVOLUTION_WHATSAPP_ENABLED: "true",
  EVOLUTION_API_URL: "https://evolution.exemplo.test",
  EVOLUTION_API_KEY: CHAVE,
};

describe("cliente HTTP da Evolution", () => {
  it("recusa teste, flag desligada e URL com segredo", () => {
    expect(() => criarClienteEvolutionHttp({ env: { ...ambiente, NODE_ENV: "test" } })).toThrow(ErroAplicacao);
    expect(() => criarClienteEvolutionHttp({ env: { ...ambiente, EVOLUTION_WHATSAPP_ENABLED: "" } })).toThrow(ErroAplicacao);
    expect(() => urlEvolutionConfiavel("https://user:segredo@evolution.exemplo.test", ambiente)).toThrow(ErroAplicacao);
    expect(() => urlEvolutionConfiavel("http://evolution.exemplo.test", ambiente)).toThrow(ErroAplicacao);
    expect(urlEvolutionConfiavel("http://127.0.0.1:8080", { NODE_ENV: "development" }).hostname).toBe("127.0.0.1");
  });

  it("consulta o estado e envia texto sem deixar a chave na mensagem de erro", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit = {}) => {
      chamadas.push({ url, init });
      if (url.includes("/connectionState/")) {
        return new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 });
      }
      if (url.includes("/message/sendText/")) {
        return new Response(JSON.stringify({ key: { id: "3EB0ABCDEF12" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: `recusou ${CHAVE}` }), { status: 401 });
    };
    const cliente = criarClienteEvolutionHttp({ env: ambiente, fetchImpl });
    await expect(cliente.estado("tgempresa12345678")).resolves.toBe("CONECTADO");
    await expect(cliente.enviarTexto("tgempresa12345678", "5511999990000", "Olá, Ana.")).resolves.toEqual({
      id: "3EB0ABCDEF12",
    });
    const cabecalho = new Headers(chamadas[0]?.init.headers);
    expect(cabecalho.get("apikey")).toBe(CHAVE);
    expect(String(chamadas[1]?.init.body)).toContain("5511999990000");
    expect(String(chamadas[1]?.init.body)).not.toContain(CHAVE);
    await expect(cliente.desconectar("tgempresa12345678")).rejects.toSatisfy((erro: unknown) => {
      return erro instanceof Error && !erro.message.includes(CHAVE);
    });
  });

  it("só aceita QR em png ou jpeg base64", () => {
    expect(qrDeBase64(`data:image/png;base64,${"A".repeat(80)}`)).toMatch(/^data:image\/png;base64,/);
    expect(qrDeBase64("javascript:alert(1)")).toBeNull();
    expect(qrDeBase64("data:image/svg+xml;base64,AAAA")).toBeNull();
  });
});
