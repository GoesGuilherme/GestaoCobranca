import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";

describe("acesso da plataforma", () => {
  async function token(papel: "DONO" | "FINANCEIRO" | "SUPORTE", superadministrador: boolean) {
    return emitirToken({
      sub: `${papel}-${superadministrador ? "plataforma" : "empresa"}`,
      email: `${papel.toLowerCase()}@exemplo.test`,
      nome: papel,
      empresaId: "empresa",
      papel,
      superadministrador,
    });
  }

  async function status(caminho: string, cookie?: string) {
    const pedido = new NextRequest(`http://127.0.0.1${caminho}`, {
      headers: cookie ? { cookie: `${COOKIE_SESSAO}=${cookie}` } : undefined,
    });
    return (await middleware(pedido)).status;
  }

  it("recusa dono, financeiro e suporte nas rotas de plataforma e libera o superadmin", async () => {
    const dono = await token("DONO", false);
    const financeiro = await token("FINANCEIRO", false);
    const suporte = await token("SUPORTE", false);
    const superadmin = await token("DONO", true);
    const caminhos = ["/admin", "/api/admin/empresas", "/api/admin/empresas/empresa-1"];

    for (const caminho of caminhos) {
      expect(await status(caminho, dono)).toBe(403);
      expect(await status(caminho, financeiro)).toBe(403);
      expect(await status(caminho, suporte)).toBe(403);
      expect(await status(caminho, superadmin)).toBe(200);
    }
  });

  it("não trata o preenchimento de pago em como ferramenta da plataforma", async () => {
    const dono = await token("DONO", false);
    expect(await status("/api/admin/pago-em", dono)).toBe(200);
    expect(await status("/api/admin/pago-em", await token("SUPORTE", false))).toBe(200);
  });
});
