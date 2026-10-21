import { SignJWT, jwtVerify } from "jose";

export type Sessao = {
  sub: string;
  email: string;
  nome: string;
};

function segredo() {
  const valor = process.env.AUTH_SECRET;
  if (!valor || valor.length < 16) {
    throw new Error("Defina AUTH_SECRET com pelo menos 16 caracteres.");
  }
  return new TextEncoder().encode(valor);
}

export async function emitirToken(sessao: Sessao): Promise<string> {
  return new SignJWT({ email: sessao.email, nome: sessao.nome })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sessao.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(segredo());
}

export async function verificarToken(token: string): Promise<Sessao | null> {
  try {
    const { payload } = await jwtVerify(token, segredo());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.nome !== "string") {
      return null;
    }
    return { sub: payload.sub, email: payload.email, nome: payload.nome };
  } catch {
    return null;
  }
}
