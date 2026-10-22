import { SignJWT, jwtVerify } from "jose";
import type { PapelUsuario } from "@/lib/tipos";

const PAPEIS = new Set<PapelUsuario>(["DONO", "FINANCEIRO", "SUPORTE"]);

export type Sessao = {
  sub: string;
  email: string;
  nome: string;
  empresaId: string;
  papel: PapelUsuario;
  superadministrador: boolean;
};

function segredo() {
  const valor = process.env.AUTH_SECRET;
  if (!valor || valor.length < 16) {
    throw new Error("Defina AUTH_SECRET com pelo menos 16 caracteres.");
  }
  return new TextEncoder().encode(valor);
}

export async function emitirToken(sessao: Sessao): Promise<string> {
  return new SignJWT({
    email: sessao.email,
    nome: sessao.nome,
    empresaId: sessao.empresaId,
    papel: sessao.papel,
    superadministrador: sessao.superadministrador,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sessao.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(segredo());
}

export async function verificarToken(token: string): Promise<Sessao | null> {
  try {
    const { payload } = await jwtVerify(token, segredo());
    const papel = payload.papel;
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.nome !== "string" ||
      typeof payload.empresaId !== "string" ||
      typeof papel !== "string" ||
      !PAPEIS.has(papel as PapelUsuario)
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      nome: payload.nome,
      empresaId: payload.empresaId,
      papel: papel as PapelUsuario,
      superadministrador: payload.superadministrador === true,
    };
  } catch {
    return null;
  }
}
