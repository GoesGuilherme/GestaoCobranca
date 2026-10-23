import { podeEmitirCobranca } from "@/lib/permissoes";
import type { SituacaoFatura } from "@/lib/tipos";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { listarFaturas } from "@/server/services/fatura-service";
import { situacaoFatura } from "@/lib/rotulos";

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const url = new URL(request.url);
    const situacao = situacaoFatura(url.searchParams.get("situacao") ?? undefined) as SituacaoFatura;
    const busca = url.searchParams.get("busca") ?? "";
    const faturas = await listarFaturas(acesso, { situacao, busca });
    return jsonOk({ faturas, podeEmitir: podeEmitirCobranca(acesso.papel) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
