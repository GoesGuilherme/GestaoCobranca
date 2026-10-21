import { criarFilial, listarFiliais } from "@/server/services/filial-service";
import { jsonErro, jsonOk, lerJson } from "@/server/http";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    return jsonOk({ filiais: await listarFiliais(id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request, contexto: Contexto) {
  try {
    const { id } = await contexto.params;
    const filial = await criarFilial(id, await lerJson(request));
    return jsonOk({ filial }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
