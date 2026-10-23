import { podeAlterarServicos, podeVerResultado } from "@/lib/permissoes";
import type { PapelUsuario } from "@/lib/tipos";
import { ErroAplicacao } from "@/server/erros";

export type AutorEmpresa = {
  empresaId: string;
  papel: PapelUsuario;
};

export function exigirFinanceiro(autor: AutorEmpresa) {
  if (!podeAlterarServicos(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono ou o financeiro pode alterar serviços e valores.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirResultado(autor: AutorEmpresa) {
  if (!podeVerResultado(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono da empresa pode ver o resultado.",
      403,
      "sem_permissao",
    );
  }
}
