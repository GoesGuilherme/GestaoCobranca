import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { jsonErro, lerJson } from "@/server/http";
import { redefinirSenha } from "@/server/services/redefinicao-senha-service";

export async function POST(request: Request) {
  try {
    await redefinirSenha(await lerJson(request));
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
  } catch (erro) {
    return jsonErro(erro);
  }
}
