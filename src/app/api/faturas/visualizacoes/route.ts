import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { sincronizarAsaasDoAutor } from "@/server/services/asaas-conciliacao";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    const resultado = await sincronizarAsaasDoAutor(acesso);
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
