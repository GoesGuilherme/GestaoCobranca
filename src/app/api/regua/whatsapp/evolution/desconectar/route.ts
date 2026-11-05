import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { desconectarEvolution } from "@/server/services/evolution-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await desconectarEvolution(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
