import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { podeConfigurarAsaas, podeVerFaturas, podeVerRegua, podeVerResultado } from "@/lib/permissoes";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { verificarToken } from "@/server/auth/token";

function destinoSeguro(valor: string | null): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

function paginaProibida(pathname: string, titulo: string, texto: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: texto, codigo: "sem_permissao" }, { status: 403 });
  }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso negado · Gestão Cobrança</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f3eee4;color:#1c1915;font-family:Georgia,serif"><main style="max-width:36rem;padding:2rem"><p style="letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;color:#a97816">Acesso negado</p><h1 style="font-size:2.5rem;font-weight:500">${titulo}</h1><p style="color:#6d655c">${texto}</p><p><a href="/" style="color:#2f6a52">Voltar ao painel</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function resultadoProibido(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { erro: "Só o dono da empresa pode ver o resultado.", codigo: "sem_permissao" },
      { status: 403 },
    );
  }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso negado · Gestão Cobrança</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f3eee4;color:#1c1915;font-family:Georgia,serif"><main style="max-width:36rem;padding:2rem"><p style="letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;color:#a97816">Acesso negado</p><h1 style="font-size:2.5rem;font-weight:500">Só o dono vê esta página</h1><p style="color:#6d655c">O resultado de custo e faturamento fica com o dono da empresa. Financeiro e suporte não entram aqui.</p><p><a href="/" style="color:#2f6a52">Voltar ao painel</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarToken(token) : null;
  const autenticado = Boolean(sessao);
  const rotaPublica =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/api/auth/entrar" ||
    pathname === "/api/cadastro" ||
    pathname === "/api/webhooks/asaas" ||
    pathname === "/api/cron/regua";

  if (rotaPublica) {
    const empresaSuspensa = request.nextUrl.searchParams.get("motivo") === "suspensa";
    if (autenticado && pathname === "/login" && !empresaSuspensa) {
      return NextResponse.redirect(
        new URL(destinoSeguro(request.nextUrl.searchParams.get("next")), request.url),
      );
    }
    return NextResponse.next();
  }

  if (!autenticado || !sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const rotaResultado = pathname === "/resultado" || pathname.startsWith("/resultado/") || pathname === "/api/resultado";
  if (rotaResultado && !podeVerResultado(sessao.papel)) {
    return resultadoProibido(pathname);
  }

  const rotaPainelFinanceiro =
    pathname === "/painel-financeiro" ||
    pathname.startsWith("/painel-financeiro/") ||
    pathname === "/api/painel-financeiro" ||
    pathname.startsWith("/api/painel-financeiro/");
  if (rotaPainelFinanceiro && !podeVerFaturas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "O painel financeiro fica com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver o painel financeiro.",
    );
  }

  const rotaFaturas =
    pathname === "/faturas" ||
    pathname.startsWith("/faturas/") ||
    pathname === "/api/faturas" ||
    pathname.startsWith("/api/faturas/") ||
    pathname.startsWith("/api/recorrencias") ||
    /^\/api\/clientes\/[^/]+\/faturas\/?$/.test(pathname) ||
    /^\/api\/servicos-cliente\/[^/]+\/recorrencia(\/|$)/.test(pathname);
  if (rotaFaturas && !podeVerFaturas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "Faturas ficam com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver as faturas.",
    );
  }

  const rotaRegua =
    pathname === "/regua" ||
    pathname.startsWith("/regua/") ||
    pathname === "/api/regua" ||
    pathname.startsWith("/api/regua/") ||
    /^\/api\/clientes\/[^/]+\/regua\/?$/.test(pathname);
  if (rotaRegua && !podeVerRegua(sessao.papel)) {
    return paginaProibida(
      pathname,
      "A régua fica com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver a régua de cobrança.",
    );
  }

  const rotaAsaas = pathname === "/asaas" || pathname.startsWith("/asaas/") || pathname.startsWith("/api/asaas");
  if (rotaAsaas && !podeConfigurarAsaas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "Só o dono configura o Asaas",
      "A chave da API e o token do webhook ficam com o dono da empresa. Financeiro e suporte não entram aqui.",
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
