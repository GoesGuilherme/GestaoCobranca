import { describe, expect, it } from "vitest";
import { ipDaRequisicao } from "@/server/http";

function pedido(headers: Record<string, string>) {
  return new Request("http://localhost/api/auth/entrar", { headers });
}

describe("IP usado nos limites", () => {
  it("na Vercel ignora o x-forwarded-for e usa só o x-real-ip", () => {
    const env = { VERCEL: "1", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    const ip = ipDaRequisicao(
      pedido({ "x-forwarded-for": "203.0.113.8, 198.51.100.20", "x-real-ip": "198.51.100.20" }),
      env,
    );
    expect(ip).toBe("198.51.100.20");
    expect(ipDaRequisicao(pedido({ "x-forwarded-for": "203.0.113.8" }), env)).toBeNull();
  });

  it("no teste usa o último salto, não o prefixo forjado", () => {
    const env = { NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;
    expect(ipDaRequisicao(pedido({ "x-forwarded-for": "203.0.113.8, 198.51.100.20" }), env)).toBe("198.51.100.20");
  });

  it("fora da Vercel e do teste não confia em cabeçalho de IP", () => {
    const env = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    expect(ipDaRequisicao(pedido({ "x-forwarded-for": "203.0.113.8", "x-real-ip": "198.51.100.20" }), env)).toBeNull();
  });
});