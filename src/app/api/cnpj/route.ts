import { exigirAcesso } from "@/server/auth/acesso";
import { consultarCnpj } from "@/server/cnpj/consultar";
import { jsonErro, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const cnpj = new URL(request.url).searchParams.get("cnpj") ?? "";
    const resultado = await consultarCnpj(cnpj, acesso.empresaId);
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
