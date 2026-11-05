import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { privilegioDoToken } from "@/server/auth/privilegio";
import { jsonErro, jsonOk } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenDoCookie(cookie: string | null): string | null {
  if (!cookie) return null;
  const parte = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_SESSAO}=`));
  if (!parte) return null;
  return decodeURIComponent(parte.slice(COOKIE_SESSAO.length + 1));
}

export async function GET(request: Request) {
  try {
    const privilegio = await privilegioDoToken(tokenDoCookie(request.headers.get("cookie")));
    if (!privilegio) return jsonOk({ erro: "Não autenticado." }, 401);
    return jsonOk(privilegio);
  } catch (erro) {
    return jsonErro(erro);
  }
}
