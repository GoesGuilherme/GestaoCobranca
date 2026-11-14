import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, jsonOk } from "@/server/http";
import { importarExtratoOfx } from "@/server/services/ofx-conciliacao";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const form = await request.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) {
      throw new ErroAplicacao("Selecione um arquivo .ofx.", 400, "arquivo");
    }
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    const resumo = await importarExtratoOfx(acesso, { nome: arquivo.name || "extrato.ofx", conteudo });
    return jsonOk({ resumo });
  } catch (erro) {
    return jsonErro(erro);
  }
}
