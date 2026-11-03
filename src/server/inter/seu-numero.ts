import { createHash } from "node:crypto";

const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// O Inter aceita no máximo 15 caracteres em seuNumero e usa esse campo,
// junto com valor, vencimento e CPF/CNPJ, como chave de idempotência por 30 minutos.
// A chave do Taguaro pode ser maior e ter hífen, então vira um código estável de 15.
export function seuNumeroDe(chave: string): string {
  const limpo = chave.trim();
  if (/^[A-Za-z0-9]{1,15}$/.test(limpo)) return limpo.toUpperCase();
  const hash = createHash("sha256").update(limpo, "utf8").digest();
  let saida = "";
  for (let indice = 0; indice < 15; indice += 1) {
    saida += ALFABETO[hash[indice] % ALFABETO.length];
  }
  return saida;
}
