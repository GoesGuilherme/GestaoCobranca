import { describe, expect, it } from "vitest";
import { cabecalhosSeguranca } from "./cabecalhos";

describe("cabeçalhos de segurança", () => {
  it("não abre CORS e restringe frame, tipo e origem", () => {
    const mapa = new Map(cabecalhosSeguranca().map((item) => [item.key, item.value]));
    expect(mapa.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mapa.get("X-Frame-Options")).toBe("DENY");
    expect(mapa.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(mapa.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(mapa.get("Content-Security-Policy")).not.toContain("*");
    expect([...mapa.keys()].join(" ")).not.toMatch(/access-control-allow-origin/i);
  });
});
