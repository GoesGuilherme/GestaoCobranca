import { podeVerCustoServico } from "@/lib/permissoes";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import {
  criarServicoDoCliente,
  listarServicosDoCliente,
} from "@/server/services/cliente-servico-service";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    return jsonOk({
      servicos: await listarServicosDoCliente(
        acesso.empresaId,
        id,
        podeVerCustoServico(acesso.papel),
      ),
    });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const servico = await criarServicoDoCliente(acesso, id, await lerJson(request));
    return jsonOk({ servico }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
