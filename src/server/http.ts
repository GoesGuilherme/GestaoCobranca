import { NextResponse } from "next/server";
import { ErroAplicacao } from "./erros";

export function jsonOk(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status });
}

export async function lerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ErroAplicacao("O corpo da requisição não é um JSON válido.", 400, "json_invalido");
  }
}

export function ipDaRequisicao(request: Request): string | null {
  const encaminhado = request.headers.get("x-forwarded-for");
  const bruto = (encaminhado?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "").trim();
  if (!bruto || bruto.length > 64) return null;
  return bruto;
}

export function jsonErro(erro: unknown) {
  if (erro instanceof ErroAplicacao) {
    return NextResponse.json(
      { erro: erro.message, codigo: erro.codigo, campos: erro.campos },
      { status: erro.status },
    );
  }
  console.error(erro);
  return NextResponse.json(
    { erro: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}
