import { compare, hash } from "bcryptjs";

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, 10);
}

export function compararSenha(senha: string, senhaHash: string): Promise<boolean> {
  return compare(senha, senhaHash);
}
