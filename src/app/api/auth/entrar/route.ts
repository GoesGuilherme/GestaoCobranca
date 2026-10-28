import { NextResponse } from "next/server";
import { esquemaLogin } from "@/lib/validacao";
import { autenticar } from "@/server/auth/entrar";
import { opcoesCookie } from "@/server/auth/sessao";
import { emitirToken } from "@/server/auth/token";
import { jsonErro, lerJson } from "@/server/http";
import { lerEsquema } from "@/server/validar";

export async function POST(request: Request) {
  try {
    const dados = lerEsquema(esquemaLogin, await lerJson(request));
    const usuario = await autenticar(dados.email, dados.senha);

    const token = await emitirToken({
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      empresaId: usuario.empresaId,
      papel: usuario.papel,
      superadministrador: usuario.superadministrador,
      versaoSessao: usuario.versaoSessao,
    });

    const resposta = NextResponse.json({ nome: usuario.nome, email: usuario.email });
    resposta.cookies.set(opcoesCookie(token));
    return resposta;
  } catch (erro) {
    return jsonErro(erro);
  }
}
