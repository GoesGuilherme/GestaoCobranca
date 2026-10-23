import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { importarFaturas } from "@/server/services/fatura-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    const resultado = await importarFaturas(acesso);
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
