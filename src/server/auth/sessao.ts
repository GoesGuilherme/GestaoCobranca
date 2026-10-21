import { cookies } from "next/headers";
import { COOKIE_SESSAO, DURACAO_SESSAO } from "./constantes";
import { verificarToken, type Sessao } from "./token";

export async function obterSessao(): Promise<Sessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  return verificarToken(token);
}

export function opcoesCookie(token: string) {
  return {
    name: COOKIE_SESSAO,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SESSAO,
  };
}
