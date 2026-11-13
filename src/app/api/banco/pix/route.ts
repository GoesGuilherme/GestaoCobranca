import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { obterConfiguracaoPix, salvarConfiguracaoPix } from "@/server/services/pix-config-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ configuracao: await obterConfiguracaoPix(acesso) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const configuracao = await salvarConfiguracaoPix(acesso, await lerJson(request));
    return jsonOk({ configuracao });
  } catch (erro) {
    return jsonErro(erro);
  }
}
