import { esquemaEnvioLinkCartao } from "@/lib/validacao";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { enviarLinkCartaoManual } from "@/server/services/link-cartao-manual";
import { lerEsquema } from "@/server/validar";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const dados = lerEsquema(esquemaEnvioLinkCartao, await lerJson(request));
    const envio = await enviarLinkCartaoManual(acesso, { faturaId: id }, dados.canal);
    return jsonOk({ envio });
  } catch (erro) {
    return jsonErro(erro);
  }
}
