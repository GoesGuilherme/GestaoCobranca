import { redirect } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { CaixaMensagens } from "@/components/caixa-mensagens";
import { urlSemAbasMensagens } from "@/lib/caixa-mensagens";
import { dataHojeIso } from "@/lib/data";
import { podeVerMensagens } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import {
  abrirConversaMensagens,
  clientesComMensagem,
  lerFiltroMensagens,
  listarCaixaMensagens,
  obterMensagem,
} from "@/server/services/mensagens-service";

export const metadata = { title: "Mensagens" };

type Busca = {
  aba?: string;
  periodo?: string;
  de?: string;
  ate?: string;
  status?: string;
  canal?: string;
  cliente?: string;
  q?: string;
  mensagem?: string;
  conversa?: string;
};

export default async function PaginaMensagens({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerMensagens(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="As mensagens ficam com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver o WhatsApp e o SMS enviados pela empresa."
      />
    );
  }

  if (params.aba || params.mensagem) {
    let conversa = params.conversa;
    if (params.mensagem) {
      const detalhe = await obterMensagem(acesso, params.mensagem);
      if (detalhe?.telefone) conversa = detalhe.telefone;
    }
    const destino = urlSemAbasMensagens({ ...params, conversa });
    if (destino) redirect(destino);
  }

  const hoje = dataHojeIso();
  const filtro = lerFiltroMensagens({ ...params, periodo: params.periodo ?? "todos" }, hoje);
  const filtroConversa = { ...filtro, status: "" as const, busca: "" };
  const [pagina, clientes, conversa] = await Promise.all([
    listarCaixaMensagens(acesso, filtro),
    clientesComMensagem(acesso),
    params.conversa ? abrirConversaMensagens(acesso, params.conversa, { filtro: filtroConversa, limite: 40 }) : Promise.resolve(null),
  ]);
  const conversas = conversa
    ? pagina.itens.map((item) => (item.telefone === conversa.telefone ? { ...item, naoLidas: 0 } : item))
    : pagina.itens;

  return (
    <CaixaMensagens
      filtro={{
        periodo: filtro.periodo,
        de: filtro.de,
        ate: filtro.ate,
        status: filtro.status,
        canal: filtro.canal,
        clienteId: filtro.clienteId,
        busca: filtro.busca,
      }}
      clientes={clientes}
      conversasIniciais={conversas}
      cursorInicial={pagina.proximoCursor}
      conversa={conversa}
      agoraIso={new Date().toISOString()}
    />
  );
}
