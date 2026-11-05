import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { consumirLimiteUsuario } from "@/server/seguranca/limite";
import { importarFaturas } from "@/server/services/fatura-service";

export async function POST() {
  try {
    const acesso = await exigirAcesso();
    await consumirLimiteUsuario(acesso.usuarioId, "faturas-importar", 6, 10 * 60 * 1000);
    const resultado = await importarFaturas(acesso);
    return jsonOk(resultado);
  } catch (erro) {
    return jsonErro(erro);
  }
}
