import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { enviarLembreteAgora } from "@/server/services/regua-service";

type Contexto = { params: Promise<{ id: string }> };

export async function POST(request: Request, contexto: Contexto) {
  try {
    const acesso = await exigirAcesso();
    const { id } = await contexto.params;
    const envio = await enviarLembreteAgora(acesso, id, await lerJson(request));
    return jsonOk({ lembrete: envio.lembrete, whatsapp: envio.whatsapp }, 201);
  } catch (erro) {
    return jsonErro(erro);
  }
}
