import { NextResponse } from "next/server";
import { cronAutorizado } from "@/server/cron/segredo";
import { jsonErro } from "@/server/http";
import { sincronizarVisualizacoesAgendadas } from "@/server/services/visualizacao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function executar(request: Request) {
  const acesso = cronAutorizado(request);
  if (acesso === "ausente") {
    return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 500 });
  }
  if (!acesso) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  try {
    const resultado = await sincronizarVisualizacoesAgendadas();
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
