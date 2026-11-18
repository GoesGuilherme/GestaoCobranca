import { dataHojeIso } from "@/lib/data";
import { exigirAcesso } from "@/server/auth/acesso";
import { jsonErro, jsonOk } from "@/server/http";
import { abrirConversaMensagens, lerFiltroMensagens } from "@/server/services/mensagens-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Página anterior da conversa. O status e a busca filtram a lista, não o fio.
export async function GET(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filtro = lerFiltroMensagens({ ...params, periodo: params.periodo ?? "todos", status: "", q: "" }, dataHojeIso());
    const conversa = await abrirConversaMensagens(acesso, params.conversa ?? "", {
      filtro,
      antes: params.antes ?? null,
      marcarLida: false,
      limite: 40,
    });
    if (!conversa) return jsonOk({ bolhas: [], proximoCursor: null });
    return jsonOk({ bolhas: conversa.bolhas, proximoCursor: conversa.proximoCursor });
  } catch (erro) {
    return jsonErro(erro);
  }
}
