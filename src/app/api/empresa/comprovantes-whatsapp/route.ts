import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { salvarLeituraComprovantes } from "@/server/services/comprovante-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const corpo = await lerJson(request);
    const ativo = Boolean(corpo && typeof corpo === "object" && "ativo" in corpo && corpo.ativo === true);
    const salvo = await salvarLeituraComprovantes(acesso, ativo);
    return jsonOk(salvo);
  } catch (erro) {
    return jsonErro(erro);
  }
}
