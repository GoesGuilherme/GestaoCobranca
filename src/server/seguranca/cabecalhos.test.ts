import { describe, expect, it } from "vitest";
import { cabecalhosSeguranca, politicaConteudo } from "./cabecalhos";

describe("cabeçalhos de segurança", () => {
  it("não abre CORS e restringe frame, tipo e origem", () => {
    const mapa = new Map(cabecalhosSeguranca().map((item) => [item.key, item.value]));
    expect(mapa.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mapa.get("X-Frame-Options")).toBe("DENY");
    expect([...mapa.keys()].join(" ")).not.toMatch(/access-control-allow-origin/i);
    const csp = politicaConteudo("nonceTeste123=");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' 'nonce-nonceTeste123=' 'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("*");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});
