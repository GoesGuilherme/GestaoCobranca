import { NextResponse } from "next/server";
import { cronAutorizado } from "@/server/cron/segredo";
import { jsonErro } from "@/server/http";
import { executarRecorrenciasCora } from "@/server/services/cora-recorrencia";
import { executarRecorrenciasInter } from "@/server/services/inter-recorrencia";
import { executarRecorrenciasPix } from "@/server/services/pix-recorrencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function executar(request: Request) {
  const acesso = cronAutorizado(request);
  if (acesso === "ausente") return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 500 });
  if (!acesso) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const inter = await executarRecorrenciasInter();
    const cora = await executarRecorrenciasCora();
    const pix = await executarRecorrenciasPix();
    return NextResponse.json({ ok: true, ...inter, cora, pix });
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
