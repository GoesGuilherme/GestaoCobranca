import { NextResponse } from "next/server";
import { esquemaLogin } from "@/lib/validacao";
import { autenticar } from "@/server/auth/entrar";
import { opcoesCookie } from "@/server/auth/sessao";
import { emitirToken } from "@/server/auth/token";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, lerJson } from "@/server/http";
import { exigirLimiteLogin, registrarFalhaLogin } from "@/server/seguranca/limite";
import { lerEsquema } from "@/server/validar";

export async function POST(request: Request) {
  try {
    const dados = lerEsquema(esquemaLogin, await lerJson(request));
    await exigirLimiteLogin(dados.email);
    let usuario;
    try {
      usuario = await autenticar(dados.email, dados.senha);
    } catch (erro) {
      if (erro instanceof ErroAplicacao && (erro.status === 401 || erro.status === 403)) {
        await registrarFalhaLogin(dados.email);
      }
      throw erro;
    }

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
