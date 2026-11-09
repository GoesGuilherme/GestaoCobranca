import { NextResponse } from "next/server";
import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { iniciarOauthCora, opcoesCookieOauth } from "@/server/services/cora-oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const iniciado = await iniciarOauthCora(acesso);
    const resposta = NextResponse.redirect(iniciado.url);
    resposta.cookies.set(opcoesCookieOauth(iniciado.cookie));
    return resposta;
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 401) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", "/banco");
      return NextResponse.redirect(login);
    }
    const pagina = new URL("/banco", request.url);
    const semParceiro = erro instanceof ErroAplicacao && erro.codigo === "cora_sem_parceiro";
    pagina.searchParams.set("cora", semParceiro ? "sem_parceiro" : "erro");
    return NextResponse.redirect(pagina);
  }
}
