import { NextResponse } from "next/server";
import { esquemaLogin } from "@/lib/validacao";
import { opcoesCookie } from "@/server/auth/sessao";
import { compararSenha } from "@/server/auth/senha";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, lerJson } from "@/server/http";
import { lerEsquema } from "@/server/validar";

export async function POST(request: Request) {
  try {
    const dados = lerEsquema(esquemaLogin, await lerJson(request));
    const usuario = await prisma.usuario.findUnique({
      where: { email: dados.email.toLowerCase() },
    });

    if (!usuario || !(await compararSenha(dados.senha, usuario.senhaHash))) {
      throw new ErroAplicacao("E-mail ou senha incorretos.", 401, "credenciais");
    }

    const token = await emitirToken({
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
    });

    const resposta = NextResponse.json({ nome: usuario.nome, email: usuario.email });
    resposta.cookies.set(opcoesCookie(token));
    return resposta;
  } catch (erro) {
    return jsonErro(erro);
  }
}
