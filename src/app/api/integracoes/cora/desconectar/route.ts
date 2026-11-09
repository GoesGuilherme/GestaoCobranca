import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { desconectarCora } from "@/server/services/cora-config-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ configuracao: await desconectarCora(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
