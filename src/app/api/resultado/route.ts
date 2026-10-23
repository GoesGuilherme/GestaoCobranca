import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { obterResultado } from "@/server/services/resultado-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ resultado: await obterResultado(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
