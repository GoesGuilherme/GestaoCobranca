import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk, lerJson } from "@/server/http";
import { escolherProvedorWhatsapp } from "@/server/services/evolution-service";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    return jsonOk(await escolherProvedorWhatsapp(acesso, await lerJson(request)));
  } catch (erro) {
    return jsonErro(erro);
  }
}
