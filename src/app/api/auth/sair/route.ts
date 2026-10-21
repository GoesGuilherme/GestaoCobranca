import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/server/auth/constantes";

export async function POST() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set({
    name: COOKIE_SESSAO,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return resposta;
}
