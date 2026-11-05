import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { conectarEvolution } from "@/server/services/evolution-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await conectarEvolution(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
