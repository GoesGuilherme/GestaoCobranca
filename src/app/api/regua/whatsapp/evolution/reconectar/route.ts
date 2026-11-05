import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { reconectarEvolution } from "@/server/services/evolution-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await reconectarEvolution(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
