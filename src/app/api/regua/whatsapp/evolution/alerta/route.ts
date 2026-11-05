import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { marcarAlertaWhatsappLido } from "@/server/services/evolution-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await marcarAlertaWhatsappLido(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
