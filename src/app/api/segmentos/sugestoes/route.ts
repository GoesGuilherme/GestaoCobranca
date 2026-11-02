import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { criarSugestoesSegmento, listarSegmentos } from "@/server/services/segmento-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    const resultado = await criarSugestoesSegmento(acesso);
    return jsonOk({ ...resultado, segmentos: await listarSegmentos(acesso.empresaId) });
  } catch (erro) {
    return jsonErro(erro);
  }
}
