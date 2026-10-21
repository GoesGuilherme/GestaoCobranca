import { jsonErro, jsonOk } from "@/server/http";
import { obterPainel } from "@/server/services/painel-service";

export async function GET() {
  try {
    return jsonOk({ painel: await obterPainel() });
  } catch (erro) {
    return jsonErro(erro);
  }
}
