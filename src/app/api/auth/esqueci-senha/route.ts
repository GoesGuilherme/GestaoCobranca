import { pedirRedefinicaoSenha } from "@/server/services/redefinicao-senha-service";
import { ipDaRequisicao, jsonErro, jsonOk, lerJson } from "@/server/http";

export async function POST(request: Request) {
  try {
    const resultado = await pedirRedefinicaoSenha(await lerJson(request), {
      ip: ipDaRequisicao(request),
      origem: origemDaRequisicao(request),
    });
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}

function origemDaRequisicao(request: Request): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return "http://127.0.0.1:3000";
  return `${proto}://${host}`;
}
