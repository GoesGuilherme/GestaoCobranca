import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { compararSenha } from "./senha";

export async function autenticar(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase() },
    include: { empresa: true },
  });

  if (!usuario || !(await compararSenha(senha, usuario.senhaHash))) {
    throw new ErroAplicacao("E-mail ou senha incorretos.", 401, "credenciais");
  }

  if (usuario.empresa.status !== "ATIVA") {
    throw new ErroAplicacao(
      "Esta empresa está suspensa. O acesso volta quando a plataforma reativar a conta.",
      403,
      "empresa_suspensa",
    );
  }

  return usuario;
}
