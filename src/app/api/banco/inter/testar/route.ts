import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { testarConexaoInter } from "@/server/services/inter-config-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await testarConexaoInter(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
