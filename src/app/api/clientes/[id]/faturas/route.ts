import { podeEmitirCobranca } from "@/lib/permissoes";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { emitirFatura, listarFaturas } from "@/server/services/fatura-service";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const faturas = await listarFaturas(acesso.empresaId, {
      clienteId: id,
      situacao: "todas",
      ordem: "desc",
    });
    return jsonOk({ faturas, podeEmitir: podeEmitirCobranca(acesso.papel) });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const fatura = await emitirFatura(acesso, id, await lerJson(request));
    return jsonOk({ fatura }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
