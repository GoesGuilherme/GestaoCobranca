import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { reenviarBoletos } from "@/server/services/reenvio-boleto-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const resultado = await reenviarBoletos(acesso, await lerJson(request));
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
