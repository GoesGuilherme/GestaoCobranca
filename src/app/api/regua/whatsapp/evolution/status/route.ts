import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { atualizarStatusEvolution } from "@/server/services/evolution-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await atualizarStatusEvolution(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
