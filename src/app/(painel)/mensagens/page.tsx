import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeCampo } from "@/components/campo";
import { ListaConversas, PainelConversa } from "@/components/conversa-mensagens";
import { classeBotaoPrimario, classeBotaoSecundario } from "@/components/estilos";
import { DetalheMensagem, ListaMensagens } from "@/components/lista-mensagens";
import { dataHojeIso } from "@/lib/data";
import { CANAIS_MENSAGEM, PERIODOS_MENSAGEM, STATUS_MENSAGEM } from "@/lib/mensagens-twilio";
import { podeVerMensagens } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import {
  clientesComMensagem,
  lerFiltroMensagens,
  listarConversas,
  listarMensagens,
  obterConversa,
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

function hrefDe(params: Record<string, string | undefined>) {
  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor) consulta.set(chave, valor);
  }
  const texto = consulta.toString();
  return texto ? `/mensagens?${texto}` : "/mensagens";
}

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

  const aba = params.aba === "conversas" ? "conversas" : "envios";
  const filtro = lerFiltroMensagens(params, dataHojeIso());
  const base = {
    periodo: filtro.periodo,
    de: filtro.de,
    ate: filtro.ate,
    status: filtro.status,
    canal: filtro.canal,
    cliente: filtro.clienteId,
    q: filtro.busca,
  };

  const [lista, clientes, conversas, detalhe, conversa] = await Promise.all([
    aba === "envios" ? listarMensagens(acesso, filtro) : Promise.resolve(null),
    aba === "envios" ? clientesComMensagem(acesso) : Promise.resolve([]),
    aba === "conversas" ? listarConversas(acesso, filtro.busca) : Promise.resolve([]),
    aba === "envios" && params.mensagem ? obterMensagem(acesso, params.mensagem) : Promise.resolve(null),
    aba === "conversas" && params.conversa ? obterConversa(acesso, params.conversa) : Promise.resolve(null),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Mensagens"
        descricao="WhatsApp enviado pela Twilio e, quando houver, SMS. O horário está em Brasília. Cada empresa vê só as próprias mensagens."
      />
      <div className="mb-6 flex gap-2">
        <Link href={hrefDe({ ...base, aba: "envios" })} className={aba === "envios" ? classeBotaoPrimario : classeBotaoSecundario} aria-current={aba === "envios" ? "page" : undefined}>
          Envios
        </Link>
        <Link href={hrefDe({ ...base, aba: "conversas" })} className={aba === "conversas" ? classeBotaoPrimario : classeBotaoSecundario} aria-current={aba === "conversas" ? "page" : undefined}>
          Conversas
        </Link>
      </div>

      {aba === "envios" && lista ? (
        <>
          <form className="mb-6 grid gap-3 rounded-3xl border border-line bg-card p-4 md:grid-cols-2 xl:grid-cols-3" method="get">
            <input type="hidden" name="aba" value="envios" />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Período</span>
              <select name="periodo" defaultValue={filtro.periodo} className={classeCampo}>
                {PERIODOS_MENSAGEM.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">De</span>
              <input type="date" name="de" defaultValue={filtro.de} className={classeCampo} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Até</span>
              <input type="date" name="ate" defaultValue={filtro.ate} className={classeCampo} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Status</span>
              <select name="status" defaultValue={filtro.status} className={classeCampo}>
                <option value="">Todos</option>
                {STATUS_MENSAGEM.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Canal</span>
              <select name="canal" defaultValue={filtro.canal} className={classeCampo}>
                <option value="">Todos</option>
                {CANAIS_MENSAGEM.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Cliente</span>
              <select name="cliente" defaultValue={filtro.clienteId} className={classeCampo}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nomeFantasia}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Busca</span>
              <input
                type="search"
                name="q"
                defaultValue={filtro.busca}
                placeholder="Cliente, cobrança, identificador ou telefone"
                className={classeCampo}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={classeBotaoPrimario}>
                Filtrar
              </button>
            </div>
          </form>
          <p className="mb-3 text-sm text-muted">
            SMS aparece aqui quando a empresa enviar por esse canal. Hoje a régua registra WhatsApp. Um reenvio manual do
            mesmo passo usa a mesma linha da fila.
          </p>
          {lista.limiteAtingido ? (
            <p className="mb-3 text-sm text-muted">Mostrando os 400 envios mais recentes deste período. Afine as datas para ver o restante.</p>
          ) : null}
          <ListaMensagens
            itens={lista.itens}
            detalheId={params.mensagem ?? ""}
            hrefDetalhe={(id) => hrefDe({ ...base, aba: "envios", mensagem: id })}
          />
          {detalhe ? (
            <DetalheMensagem
              mensagem={detalhe}
              hrefConversa={hrefDe({ aba: "conversas", conversa: detalhe.telefone })}
            />
          ) : null}
        </>
      ) : (
        <>
          <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
            <input type="hidden" name="aba" value="conversas" />
            <label className="grid min-w-64 flex-1 gap-1 text-sm">
              <span className="font-medium">Busca</span>
              <input type="search" name="q" defaultValue={filtro.busca} placeholder="Cliente ou telefone" className={classeCampo} />
            </label>
            <button type="submit" className={classeBotaoPrimario}>
              Buscar
            </button>
          </form>
          <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <ListaConversas
              conversas={conversas}
              ativa={conversa?.telefone ?? ""}
              hrefConversa={(telefone) => hrefDe({ aba: "conversas", q: filtro.busca, conversa: telefone })}
            />
            {conversa ? (
              <PainelConversa conversa={conversa} />
            ) : (
              <p className="text-sm text-muted">Escolha uma conversa para ver o que foi enviado e o que o cliente respondeu.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
