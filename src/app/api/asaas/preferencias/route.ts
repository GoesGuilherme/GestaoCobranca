import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { obterPreferenciasCobranca, salvarPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ preferencias: await obterPreferenciasCobranca(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const preferencias = await salvarPreferenciasCobranca(acesso, await lerJson(request));
    return jsonOk({ preferencias });
  } catch (erro) {
    return jsonErro(erro);
  }
}
