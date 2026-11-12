import Link from "next/link";
import { formatarData } from "@/lib/formatacao";
import type { ConversaMensagens, ResumoConversa } from "@/server/services/mensagens-service";
import { FormularioRespostaWhatsapp } from "./formulario-resposta-whatsapp";

export function ListaConversas({
  conversas,
  ativa,
  hrefConversa,
}: {
  conversas: ResumoConversa[];
  ativa: string;
  hrefConversa: (telefone: string) => string;
}) {
  if (conversas.length === 0) {
    return <p className="text-sm text-muted">Nenhuma conversa neste filtro.</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
      {conversas.map((conversa) => (
        <li key={conversa.telefone}>
          <Link
            href={hrefConversa(conversa.telefone)}
            aria-current={conversa.telefone === ativa ? "page" : undefined}
            className={`block px-4 py-3 hover:bg-sand/50 ${conversa.telefone === ativa ? "bg-sand/70" : ""}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{conversa.nomes}</span>
              {conversa.naoLidas > 0 ? (
                <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-white">
                  {conversa.naoLidas} não {conversa.naoLidas === 1 ? "lida" : "lidas"}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-xs text-muted">{conversa.telefoneExibicao}</span>
            <span className="mt-1 block truncate text-sm text-muted">{conversa.previa}</span>
            <span className="mt-1 block text-xs text-muted">{formatarData(conversa.ultimaEm)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PainelConversa({ conversa }: { conversa: ConversaMensagens }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4" aria-labelledby="titulo-conversa">
      <h2 id="titulo-conversa" className="font-display text-2xl">
        {conversa.clientes.map((cliente) => cliente.nome).join(", ") || "Número sem cadastro"}
      </h2>
      <p className="text-sm text-muted">{conversa.telefoneExibicao}</p>
      {conversa.naoLidas > 0 ? (
        <p className="mt-2 text-sm">
          {conversa.naoLidas} {conversa.naoLidas === 1 ? "mensagem não lida" : "mensagens não lidas"} antes de abrir.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {conversa.clientes.map((cliente) => (
          <Link key={cliente.id} href={`/clientes/${cliente.id}`} className="text-canopy hover:underline">
            Ficha de {cliente.nome}
          </Link>
        ))}
      </div>
      <ol className="mt-4 grid max-h-[32rem] gap-3 overflow-y-auto pr-1" aria-label="Histórico da conversa">
        {conversa.bolhas.map((bolha) => (
          <li key={bolha.id} className={bolha.lado === "empresa" ? "ml-8" : "mr-8"}>
            <div
              className={`rounded-2xl px-3 py-2 text-sm ${
                bolha.lado === "empresa" ? "bg-forest text-paper" : "bg-sand text-ink"
              }`}
            >
              <p className="whitespace-pre-wrap leading-6">{bolha.texto}</p>
              <p className={`mt-1 text-xs ${bolha.lado === "empresa" ? "text-white/75" : "text-muted"}`}>
                {formatarData(bolha.quando)}
                {bolha.detalhe ? ` · ${bolha.detalhe}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <FormularioRespostaWhatsapp telefone={conversa.telefone} bloqueado={!conversa.janelaAberta} aviso={conversa.aviso} />
      </div>
    </section>
  );
}
