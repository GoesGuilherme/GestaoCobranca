import { dataHojeIso } from "@/lib/data";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { lerFiltroMensagens, listarCaixaMensagens } from "@/server/services/mensagens-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filtro = lerFiltroMensagens({ ...params, periodo: params.periodo ?? "todos" }, dataHojeIso());
    const pagina = await listarCaixaMensagens(acesso, filtro, { cursor: params.cursor ?? null });
    return jsonOk({ conversas: pagina.itens, proximoCursor: pagina.proximoCursor });
  } catch (erro) {
    return jsonErro(erro);
  }
}
