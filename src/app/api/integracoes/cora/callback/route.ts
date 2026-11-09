import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { COOKIE_OAUTH_CORA, concluirOauthCora, opcoesCookieOauth } from "@/server/services/cora-oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pagina(request: Request, cora: string) {
  const destino = new URL("/banco", request.url);
  destino.searchParams.set("cora", cora);
  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set(opcoesCookieOauth("", 0));
  return resposta;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return pagina(request, "recusado");
  try {
    const acesso = await exigirAcesso();
    const jar = await cookies();
    const resultado = await concluirOauthCora({
      acesso,
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      cookie: jar.get(COOKIE_OAUTH_CORA)?.value ?? null,
    });
    return pagina(request, resultado.webhook === "ok" ? "conectado" : "conectado_sem_webhook");
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 401) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", "/banco");
      return NextResponse.redirect(login);
    }
    return pagina(request, "erro");
  }
}
