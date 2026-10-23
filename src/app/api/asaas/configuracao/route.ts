import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import {
  obterConfiguracaoAsaas,
  salvarConfiguracaoAsaas,
} from "@/server/services/asaas-config-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ configuracao: await obterConfiguracaoAsaas(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const configuracao = await salvarConfiguracaoAsaas(acesso, await lerJson(request));
    return jsonOk({ configuracao });
  } catch (erro) {
    return jsonErro(erro);
  }
}
