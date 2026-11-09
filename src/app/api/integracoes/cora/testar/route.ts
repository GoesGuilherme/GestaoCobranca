import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { testarConexaoCora } from "@/server/services/cora-config-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await testarConexaoCora(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
