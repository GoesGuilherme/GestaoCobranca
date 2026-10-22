import type { PapelUsuario } from "./tipos";

export function podeAlterarServicos(papel: PapelUsuario): boolean {
  return papel === "DONO" || papel === "FINANCEIRO";
}
