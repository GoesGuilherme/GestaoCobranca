import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { obterPainel } from "@/server/services/painel-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ painel: await obterPainel(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
