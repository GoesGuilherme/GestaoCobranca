import { esquemaDiaVencimento } from "@/lib/validacao";
import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { ativarRecorrenciaEmLote, listarPreviaRecorrencia } from "@/server/services/recorrencia-service";

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const url = new URL(request.url);
    const dia = Number(url.searchParams.get("dia"));
    const validado = esquemaDiaVencimento.safeParse(dia);
    if (!validado.success) {
      throw new ErroAplicacao("Informe o dia de vencimento entre 1 e 31.", 400, "dia_invalido");
    }
    const clienteId = url.searchParams.get("clienteId")?.trim() || undefined;
    const previa = await listarPreviaRecorrencia(acesso, { diaVencimento: validado.data, clienteId });
    return jsonOk(previa);
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const resultado = await ativarRecorrenciaEmLote(acesso, await lerJson(request));
    return jsonOk(resultado, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
