import {
  podeAlterarServicos,
  podeAtualizarVisualizacoes,
  podeConfigurarAsaas,
  podeConfigurarAssessor,
  podeConfigurarRegua,
  podeEmitirCobranca,
  podeVerAssessor,
  podeVerFaturas,
  podeVerMetricas,
  podeVerRegua,
  podeVerResultado,
} from "@/lib/permissoes";
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

export function exigirMetricas(autor: AutorEmpresa) {
  if (!podeVerMetricas(autor.papel)) {
    throw new ErroAplicacao("Só o dono da empresa pode ver as métricas.", 403, "sem_permissao");
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

export function exigirVerFaturas(autor: AutorEmpresa) {
  if (!podeVerFaturas(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono ou o financeiro pode ver as faturas.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirAtualizarVisualizacoes(autor: AutorEmpresa) {
  if (!podeAtualizarVisualizacoes(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono da empresa pode atualizar as visualizações.",
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

export function exigirVerRegua(autor: AutorEmpresa) {
  if (!podeVerRegua(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono ou o financeiro pode ver a régua de cobrança.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirRegua(autor: AutorEmpresa) {
  if (!podeConfigurarRegua(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono da empresa pode configurar a régua.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirVerAssessor(autor: AutorEmpresa) {
  if (!podeVerAssessor(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono ou o financeiro pode ver o assessor.",
      403,
      "sem_permissao",
    );
  }
}

export function exigirAssessor(autor: AutorEmpresa) {
  if (!podeConfigurarAssessor(autor.papel)) {
    throw new ErroAplicacao(
      "Só o dono da empresa pode configurar o assessor.",
      403,
      "sem_permissao",
    );
  }
}
