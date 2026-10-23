import { podeVerCustoServico } from "@/lib/permissoes";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { criarServico, listarServicos } from "@/server/services/servico-service";

export async function GET() {
  try {
    const acesso = await exigirAcesso();
    return jsonOk({
      servicos: await listarServicos(acesso.empresaId, podeVerCustoServico(acesso.papel)),
    });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const servico = await criarServico(acesso, await lerJson(request));
    return jsonOk({ servico }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
