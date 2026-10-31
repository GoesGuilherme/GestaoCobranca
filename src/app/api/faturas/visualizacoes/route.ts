import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { sincronizarVisualizacoesDoAutor } from "@/server/services/visualizacao-fatura-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    const resultado = await sincronizarVisualizacoesDoAutor(acesso);
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
