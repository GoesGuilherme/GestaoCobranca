import { NextResponse } from "next/server";
import { cronAutorizado } from "@/server/cron/segredo";
import { jsonErro } from "@/server/http";
import { executarConciliacaoAsaas } from "@/server/services/asaas-conciliacao";
import { executarConciliacaoInter } from "@/server/services/inter-conciliacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function executar(request: Request) {
  const acesso = cronAutorizado(request);
  if (acesso === "ausente") return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 500 });
  if (!acesso) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const inter = await executarConciliacaoInter();
    const asaas = await executarConciliacaoAsaas();
    return NextResponse.json({ ok: true, ...inter, asaas });
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
