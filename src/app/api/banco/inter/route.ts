import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { obterConfiguracaoInter, salvarConfiguracaoInter, usarAsaas } from "@/server/services/inter-config-service";

export const runtime = "nodejs";

function origem(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!host) return null;
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ configuracao: await obterConfiguracaoInter(acesso, origem(request)) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "inter-config", 12, 10 * 60 * 1000);
    const corpo = await lerJson(request);
    if (corpo && typeof corpo === "object" && (corpo as { provedor?: unknown }).provedor === "ASAAS") {
      await usarAsaas(acesso);
      return jsonOk({ configuracao: await obterConfiguracaoInter(acesso, origem(request)) });
    }
    const configuracao = await salvarConfiguracaoInter(acesso, corpo, origem(request));
    return jsonOk({ configuracao });
  } catch (erro) {
    return jsonErro(erro);
  }
}
