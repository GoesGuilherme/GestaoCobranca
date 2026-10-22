import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarFilial, listarFiliais } from "@/server/services/filial-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({ filiais: await listarFiliais(acesso.empresaId, id) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const filial = await criarFilial(acesso.empresaId, id, await lerJson(request));
    return jsonOk({ filial }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
