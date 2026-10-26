import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonErro } from "@/server/http";
import { executarRegua } from "@/server/services/regua-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean | "ausente" {
  const esperado = process.env.CRON_SECRET?.trim() ?? "";
  if (!esperado) return "ausente";
  const autorizacao = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(autorizacao)?.[1]?.trim() ?? "";
  const informado = bearer || (request.headers.get("x-cron-secret")?.trim() ?? "");
  const recebido = Buffer.from(informado);
  const secreto = Buffer.from(esperado);
  if (recebido.length === 0 || recebido.length !== secreto.length) return false;
  return timingSafeEqual(recebido, secreto);
}

async function executar(request: Request) {
  const acesso = autorizado(request);
  if (acesso === "ausente") {
    return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 500 });
  }
  if (!acesso) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  try {
    const resultado = await executarRegua();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export function GET(request: Request) {
  return executar(request);
}

export function POST(request: Request) {
  return executar(request);
}
