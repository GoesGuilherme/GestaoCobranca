import { dataHojeIso } from "@/lib/data";
import { consultaPeriodo, lerFiltroPeriodo } from "@/lib/periodo-faturas";
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
    const filtroPeriodo = lerFiltroPeriodo({
      periodo: url.searchParams.get("periodo") ?? undefined,
      por: url.searchParams.get("por") ?? undefined,
      de: url.searchParams.get("de") ?? undefined,
      ate: url.searchParams.get("ate") ?? undefined,
    });
    const faturas = await listarFaturas(acesso, {
      situacao,
      busca,
      periodo: consultaPeriodo(filtroPeriodo, dataHojeIso()),
    });
    return jsonOk({ faturas, podeEmitir: podeEmitirCobranca(acesso.papel) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
