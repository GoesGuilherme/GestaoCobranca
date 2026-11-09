import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { usarProvedorCora } from "@/server/services/cora-config-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const corpo = await lerJson(request);
    const provedor = corpo && typeof corpo === "object" ? (corpo as { provedor?: unknown }).provedor : null;
    if (provedor !== "CORA" && provedor !== "ASAAS") {
      throw new ErroAplicacao("Escolha a Cora ou o Asaas.", 400, "provedor_invalido");
    }
    return jsonOk({ configuracao: await usarProvedorCora(acesso, provedor) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
