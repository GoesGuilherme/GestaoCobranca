import { createHash, randomBytes } from "node:crypto";

export function novoTokenRedefinicao(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTokenRedefinicao(token) };
}

export function hashTokenRedefinicao(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
