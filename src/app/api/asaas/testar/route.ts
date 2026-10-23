import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { testarConexaoAsaas } from "@/server/services/asaas-config-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await testarConexaoAsaas(acesso));
  } catch (erro) {
    return jsonErro(erro);
  }
}
