import type { UsuarioResumo } from "@/lib/tipos";
import { esquemaNovoUsuario } from "@/lib/validacao";
import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

function paraUsuario(usuario: {
  id: string;
  nome: string;
  email: string;
  papel: UsuarioResumo["papel"];
  superadministrador: boolean;
  criadoEm: Date;
}): UsuarioResumo {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    superadministrador: usuario.superadministrador,
    criadoEm: usuario.criadoEm.toISOString(),
  };
}

export async function listarUsuarios(empresaId: string): Promise<UsuarioResumo[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { empresaId },
    orderBy: [{ papel: "asc" }, { nome: "asc" }],
  });
  return usuarios.map(paraUsuario);
}

export async function criarUsuarioDaEmpresa(acesso: Acesso, entrada: unknown): Promise<UsuarioResumo> {
  exigirDono(acesso);
  const dados = lerEsquema(esquemaNovoUsuario, entrada);
  const email = dados.email.toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw new ErroAplicacao("Já existe um acesso com este e-mail.", 409, "email_duplicado", {
      email: "Já existe um acesso com este e-mail.",
    });
  }

  try {
    const usuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        email,
        senhaHash: await gerarHashSenha(dados.senha),
        empresaId: acesso.empresaId,
        papel: dados.papel,
        superadministrador: false,
      },
    });
    return paraUsuario(usuario);
  } catch (erro) {
    if (typeof erro === "object" && erro && "code" in erro && erro.code === "P2002") {
      throw new ErroAplicacao("Já existe um acesso com este e-mail.", 409, "email_duplicado", {
        email: "Já existe um acesso com este e-mail.",
      });
    }
    throw erro;
  }
}
