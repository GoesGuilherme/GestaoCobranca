import { sessaoCompativel } from "@/lib/redefinicao-senha";
import type { PapelUsuario } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { obterSessao } from "./sessao";

export type Acesso = {
  usuarioId: string;
  nome: string;
  email: string;
  empresaId: string;
  nomeEmpresa: string;
  cnpjEmpresa: string;
  papel: PapelUsuario;
  superadministrador: boolean;
};

export async function carregarAcesso(): Promise<Acesso | "anonimo" | "suspensa"> {
  const sessao = await obterSessao();
  if (!sessao) return "anonimo";

  const usuario = await prisma.usuario.findUnique({
    where: { id: sessao.sub },
    include: { empresa: true },
  });
  if (!usuario) return "anonimo";
  if (!sessaoCompativel(sessao.versaoSessao ?? 0, usuario.versaoSessao)) return "anonimo";
  if (usuario.empresa.status !== "ATIVA") return "suspensa";

  return {
    usuarioId: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    empresaId: usuario.empresaId,
    nomeEmpresa: usuario.empresa.nomeFantasia,
    cnpjEmpresa: usuario.empresa.cnpj,
    papel: usuario.papel,
    superadministrador: usuario.superadministrador,
  };
}

export async function exigirAcesso(): Promise<Acesso> {
  const acesso = await carregarAcesso();
  if (acesso === "anonimo") {
    throw new ErroAplicacao("Não autenticado.", 401, "nao_autenticado");
  }
  if (acesso === "suspensa") {
    throw new ErroAplicacao(
      "Esta empresa está suspensa. O acesso volta quando a plataforma reativar a conta.",
      403,
      "empresa_suspensa",
    );
  }
  return acesso;
}

export function exigirDono(acesso: Acesso) {
  if (acesso.papel !== "DONO") {
    throw new ErroAplicacao("Só o dono da empresa pode fazer isso.", 403, "sem_permissao");
  }
}

export function exigirSuperadmin(acesso: Acesso) {
  if (!acesso.superadministrador) {
    throw new ErroAplicacao("Acesso restrito à administração da plataforma.", 403, "sem_permissao");
  }
}
