import { podeAlterarServicos, podeConfigurarAsaas, podeEmitirCobranca, podeVerResultado } from "@/lib/permissoes";
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

export function exigirAsaas(autor: AutorEmpresa) {
  if (!podeConfigurarAsaas(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono da empresa pode configurar o Asaas.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirCobranca(autor: AutorEmpresa) {
  if (!podeEmitirCobranca(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono ou o financeiro pode emitir ou cancelar cobranças.",
      403,
      "sem_permissao",
    );
  }
}
