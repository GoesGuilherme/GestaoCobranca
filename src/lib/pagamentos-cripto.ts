import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ErroAplicacao } from "@/server/erros";

const ALGORITMO = "aes-256-gcm";
const BYTES_IV = 12;
const VERSAO = "v1";

function chave(): Buffer {
  const bruto = process.env.PAGAMENTOS_ENCRYPTION_KEY?.trim() ?? "";
  const bytes = Buffer.from(bruto, "base64");
  const canonico = bytes.toString("base64").replace(/=+$/, "");
  const informado = bruto.replace(/=+$/, "");
  if (bytes.length !== 32 || canonico !== informado) {
    throw new ErroAplicacao(
      "Defina PAGAMENTOS_ENCRYPTION_KEY com 32 bytes em base64 (openssl rand -base64 32). Ela cifra as credenciais dos bancos novos e não é a ASAAS_ENCRYPTION_KEY.",
      500,
      "pagamentos_sem_chave",
    );
  }
  return bytes;
}

export function cifrarSegredoPagamento(texto: string): string {
  const iv = randomBytes(BYTES_IV);
  const cifra = createCipheriv(ALGORITMO, chave(), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO, iv.toString("base64url"), tag.toString("base64url"), dados.toString("base64url")].join(":");
}

export function decifrarSegredoPagamento(pacote: string): string {
  const partes = pacote.split(":");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new ErroAplicacao("As credenciais do provedor estão ilegíveis.", 500, "credencial_ilegivel");
  }
  try {
    const iv = Buffer.from(partes[1], "base64url");
    const tag = Buffer.from(partes[2], "base64url");
    const dados = Buffer.from(partes[3], "base64url");
    const cifra = createDecipheriv(ALGORITMO, chave(), iv);
    cifra.setAuthTag(tag);
    const claro = Buffer.concat([cifra.update(dados), cifra.final()]).toString("utf8");
    if (!claro) {
      throw new ErroAplicacao("As credenciais do provedor estão ilegíveis.", 500, "credencial_ilegivel");
    }
    return claro;
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    throw new ErroAplicacao("As credenciais do provedor estão ilegíveis.", 500, "credencial_ilegivel");
  }
}
