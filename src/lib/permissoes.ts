import type { PapelUsuario } from "./tipos";

export function podeAlterarServicos(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}

// Custo, alíquota e margem são da gestão financeira. Suporte vê o preço cobrado.
export function podeVerCustoServico(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}

// O resultado custo × faturamento é só do dono. Financeiro continua vendo
// custo e margem no catálogo e na ficha do cliente.
export function podeVerResultado(papel: PapelUsuario): boolean {
  return papel === "DONO";
}

// MRR, churn e LTV são leitura de receita da empresa. Mesma regra do Resultado: só o dono.
export function podeVerMetricas(papel: PapelUsuario): boolean {
  return papel === "DONO";
}

export function podeConfigurarAsaas(papel: PapelUsuario): boolean {
  return papel === "DONO";
}

export function podeVerFaturas(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}

export function podeEmitirCobranca(papel: PapelUsuario): boolean {
  return podeVerFaturas(papel);
}

export function podeVerRegua(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}

export function podeConfigurarRegua(papel: PapelUsuario): boolean {
  return papel === "DONO";
}

export function podeVerAssessor(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}

export function podeConfigurarAssessor(papel: PapelUsuario): boolean {
  return papel === "DONO";
}
