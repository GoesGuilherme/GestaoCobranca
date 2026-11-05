import { NextResponse } from "next/server";
import { mensagemLogSegura } from "./seguranca/redacao";
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

function ipValido(valor: string | null | undefined): string | null {
  const bruto = valor?.trim() ?? "";
  if (!bruto || bruto.length > 64) return null;
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(bruto);
  const ipv6 = /^[0-9a-f:]+$/i.test(bruto) && bruto.includes(":");
  if (!ipv4 && !ipv6) return null;
  if (ipv4 && bruto.split(".").some((parte) => Number(parte) > 255)) return null;
  return bruto;
}

function ultimoEncaminhado(valor: string | null): string | null {
  if (!valor) return null;
  const partes = valor.split(",").map((parte) => parte.trim()).filter(Boolean);
  return partes.at(-1) ?? null;
}

// Na Vercel o IP confiável é o x-real-ip, que a plataforma sobrescreve.
// O primeiro x-forwarded-for é escolhido pelo cliente e não entra no limite.
// Fora da Vercel e fora do teste não há proxy confiável: o limite fica só por e-mail.
export function ipDaRequisicao(request: Request, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL === "1") return ipValido(request.headers.get("x-real-ip"));
  if (env.NODE_ENV === "test") {
    return ipValido(request.headers.get("x-real-ip")) ?? ipValido(ultimoEncaminhado(request.headers.get("x-forwarded-for")));
  }
  return null;
}

export function jsonErro(erro: unknown) {
  if (erro instanceof ErroAplicacao) {
    return NextResponse.json(
      { erro: erro.message, codigo: erro.codigo, campos: erro.campos },
      { status: erro.status },
    );
  }
  console.error(mensagemLogSegura(erro));
  return NextResponse.json(
    { erro: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}
