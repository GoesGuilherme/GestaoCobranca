import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ErroAplicacao } from "@/server/erros";

const ALGORITMO = "aes-256-gcm";
const BYTES_IV = 12;
const VERSAO = "v1";

function chave(): Buffer {
  const bruto = process.env.ASAAS_ENCRYPTION_KEY?.trim() ?? "";
  const bytes = Buffer.from(bruto, "base64");
  const canonico = bytes.toString("base64").replace(/=+$/, "");
  const informado = bruto.replace(/=+$/, "");
  if (bytes.length !== 32 || canonico !== informado) {
    throw new ErroAplicacao(
      "Defina ASAAS_ENCRYPTION_KEY com 32 bytes em base64 (openssl rand -base64 32). Ela cifra a chave da API do Asaas no banco e não é a chave da API.",
      500,
      "asaas_sem_chave",
    );
  }
  return bytes;
}

export function cifrarSegredoAsaas(texto: string): string {
  const iv = randomBytes(BYTES_IV);
  const cifra = createCipheriv(ALGORITMO, chave(), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO, iv.toString("base64url"), tag.toString("base64url"), dados.toString("base64url")].join(":");
}

export function decifrarSegredoAsaas(pacote: string): string {
  const partes = pacote.split(":");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new ErroAplicacao("A configuração do Asaas está ilegível.", 500, "asaas_ilegivel");
  }
  try {
    const iv = Buffer.from(partes[1], "base64url");
    const tag = Buffer.from(partes[2], "base64url");
    const dados = Buffer.from(partes[3], "base64url");
    const cifra = createDecipheriv(ALGORITMO, chave(), iv);
    cifra.setAuthTag(tag);
    const claro = Buffer.concat([cifra.update(dados), cifra.final()]).toString("utf8");
    if (!claro) {
      throw new ErroAplicacao("A configuração do Asaas está ilegível.", 500, "asaas_ilegivel");
    }
    return claro;
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    throw new ErroAplicacao("A configuração do Asaas está ilegível.", 500, "asaas_ilegivel");
  }
}

export function hashTokenWebhook(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokensWebhookIguais(recebido: string, esperadoHashHex: string): boolean {
  const calculado = Buffer.from(hashTokenWebhook(recebido), "hex");
  const esperado = Buffer.from(esperadoHashHex, "hex");
  if (calculado.length === 0 || calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

export function gerarTokenWebhook(): string {
  return randomBytes(32).toString("base64url");
}

export function ultimosDigitosChave(chaveApi: string): string {
  return chaveApi.slice(-4);
}

export function mascararChave(ultimos4: string): string {
  return `••••${ultimos4.slice(-4)}`;
}
