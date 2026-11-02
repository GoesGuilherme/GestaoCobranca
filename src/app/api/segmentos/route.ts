import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarSegmento, listarSegmentos } from "@/server/services/segmento-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({ segmentos: await listarSegmentos(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const segmento = await criarSegmento(acesso, await lerJson(request));
    return jsonOk({ segmento }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
