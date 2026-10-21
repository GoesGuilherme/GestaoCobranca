import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { verificarToken } from "@/server/auth/token";

function destinoSeguro(valor: string | null): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  const autenticado = token ? Boolean(await verificarToken(token)) : false;
  const rotaPublica = pathname === "/login" || pathname === "/api/auth/entrar";

  if (rotaPublica) {
    if (autenticado && pathname === "/login") {
      return NextResponse.redirect(
        new URL(destinoSeguro(request.nextUrl.searchParams.get("next")), request.url),
      );
    }
    return NextResponse.next();
  }

  if (!autenticado) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
