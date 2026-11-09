import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ErroAplicacao } from "@/server/erros";

export const COOKIE_OAUTH_CORA = "gc_cora_oauth";
const MINUTOS = 10;

function segredo() {
  const valor = process.env.AUTH_SECRET;
  if (!valor || valor.length < 16) {
    throw new ErroAplicacao("Não foi possível iniciar a conexão com a Cora.", 500, "cora_oauth");
  }
  return new TextEncoder().encode(valor);
}

export function novoEstadoOauth(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEstadoOauth(estado: string): string {
  return createHash("sha256").update(estado).digest("hex");
}

export async function assinarEstadoOauth(dados: { estado: string; empresaId: string; usuarioId: string }): Promise<string> {
  return new SignJWT({
    uso: "cora-oauth",
    estado: dados.estado,
    empresaId: dados.empresaId,
    usuarioId: dados.usuarioId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${MINUTOS}m`)
    .sign(segredo());
}

export async function lerEstadoOauth(cookie: string | null): Promise<{ estado: string; empresaId: string; usuarioId: string } | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, segredo());
    if (payload.uso !== "cora-oauth") return null;
    if (typeof payload.estado !== "string" || typeof payload.empresaId !== "string" || typeof payload.usuarioId !== "string") {
      return null;
    }
    return { estado: payload.estado, empresaId: payload.empresaId, usuarioId: payload.usuarioId };
  } catch {
    return null;
  }
}

export function estadosIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function expiraEstadoOauth(agora = new Date()): Date {
  return new Date(agora.getTime() + MINUTOS * 60_000);
}
