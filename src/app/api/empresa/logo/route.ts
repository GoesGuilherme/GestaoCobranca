import { LIMITE_LOGO_BYTES, MENSAGEM_LOGO_TAMANHO } from "@/lib/logo";
import { exigirAcesso, exigirDono } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, jsonOk } from "@/server/http";
import { gravarLogoEmpresa, removerLogoEmpresa } from "@/server/services/logo-empresa-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    const form = await request.formData();
    const arquivo = form.get("logo");
    if (!(arquivo instanceof File)) {
      throw new ErroAplicacao("Escolha a imagem da logo.", 400, "logo_ausente");
    }
    if (arquivo.size > LIMITE_LOGO_BYTES) {
      throw new ErroAplicacao(MENSAGEM_LOGO_TAMANHO, 400, "logo_invalida");
    }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const logo = await gravarLogoEmpresa(acesso, bytes);
    return jsonOk({ logo });
  } catch (erro) {
    return jsonErro(erro);
  }
}

export async function DELETE() {
  try {
    const acesso = await exigirAcesso();
    exigirDono(acesso);
    const logo = await removerLogoEmpresa(acesso);
    return jsonOk({ logo });
  } catch (erro) {
    return jsonErro(erro);
  }
}
