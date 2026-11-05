import type { PapelUsuario } from "@/lib/tipos";
import { COOKIE_SESSAO } from "./constantes";
import { verificarToken } from "./token";

export type PrivilegioVivo = {
  papel: PapelUsuario;
  superadministrador: boolean;
};

const PAPEIS = new Set<PapelUsuario>(["DONO", "FINANCEIRO", "SUPORTE"]);

export function privilegioDoJson(valor: unknown): PrivilegioVivo | null {
  if (!valor || typeof valor !== "object") return null;
  const papel = (valor as { papel?: unknown }).papel;
  const superadministrador = (valor as { superadministrador?: unknown }).superadministrador;
  if (typeof papel !== "string" || !PAPEIS.has(papel as PapelUsuario)) return null;
  return { papel: papel as PapelUsuario, superadministrador: superadministrador === true };
}

type ConsultaTeste = (token: string) => Promise<PrivilegioVivo | null> | PrivilegioVivo | null;

let consultaTeste: ConsultaTeste | null = null;

export function definirConsultaPrivilegioParaTeste(consulta: ConsultaTeste | null) {
  if (process.env.NODE_ENV === "test") consultaTeste = consulta;
}

export async function privilegioPorFetch(
  origem: string,
  cookie: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PrivilegioVivo | null> {
  try {
    const resposta = await fetchImpl(new URL("/api/auth/privilegio", origem), {
      headers: { cookie },
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    return privilegioDoJson(await resposta.json());
  } catch {
    return null;
  }
}

export async function privilegioParaMiddleware(origem: string, cookie: string | null): Promise<PrivilegioVivo | null> {
  const token = cookie?.split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith(`${COOKIE_SESSAO}=`))?.slice(COOKIE_SESSAO.length + 1);
  if (!token) return null;
  if (process.env.NODE_ENV === "test") {
    if (consultaTeste) return consultaTeste(decodeURIComponent(token));
    const sessao = await verificarToken(decodeURIComponent(token));
    if (!sessao) return null;
    return { papel: sessao.papel, superadministrador: sessao.superadministrador };
  }
  return privilegioPorFetch(origem, cookie ?? "");
}
