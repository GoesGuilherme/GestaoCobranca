import { NextResponse } from "next/server";
import { cronAutorizado } from "@/server/cron/segredo";
import { jsonErro } from "@/server/http";
import { executarRegua } from "@/server/services/regua-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function executar(request: Request) {
  const acesso = cronAutorizado(request);
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
