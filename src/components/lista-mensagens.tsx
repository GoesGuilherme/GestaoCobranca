import Link from "next/link";
import { formatarData } from "@/lib/formatacao";
import type { MensagemDetalhe, MensagemResumo } from "@/server/services/mensagens-service";
import { rotuloStatusTwilio } from "@/lib/mensagens-twilio";

const TOM: Record<string, string> = {
  NA_FILA: "bg-gold-soft text-gold-ink",
  ENVIADA: "bg-sand text-ink",
  ENTREGUE: "bg-leaf text-ok",
  LIDA: "bg-leaf text-ok",
  FALHOU: "bg-clay-soft text-clay",
  NAO_ENTREGUE: "bg-clay-soft text-clay",
  NAO_ENVIADA: "bg-sand text-muted",
};

export function SeloStatusMensagem({ status, rotulo }: { status: string; rotulo: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TOM[status] ?? TOM.NAO_ENVIADA}`}>
      {rotulo}
    </span>
  );
}

export function ListaMensagens({
  itens,
  hrefDetalhe,
  detalheId,
}: {
  itens: MensagemResumo[];
  hrefDetalhe: (id: string) => string;
  detalheId: string;
}) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted">Nenhuma mensagem neste filtro.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-card">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Quando</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Cobrança</th>
            <th className="px-4 py-3 font-medium">Canal</th>
            <th className="px-4 py-3 font-medium">Envio</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className={`border-b border-line last:border-0 ${item.id === detalheId ? "bg-sand/50" : ""}`}>
              <td className="px-4 py-3 whitespace-nowrap">
                <Link href={hrefDetalhe(item.id)} className="font-medium text-canopy hover:underline">
                  {formatarData(item.quando)}
                </Link>
                {item.modoTeste ? <span className="mt-1 block text-xs text-muted">Modo teste</span> : null}
              </td>
              <td className="px-4 py-3">
                <Link href={`/clientes/${item.clienteId}`} className="hover:underline">
                  {item.cliente}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link href={`/faturas/${item.faturaId}`} className="hover:underline">
                  {item.fatura}
                </Link>
              </td>
              <td className="px-4 py-3">{item.canalRotulo}</td>
              <td className="px-4 py-3">{item.envio}</td>
              <td className="px-4 py-3">
                <SeloStatusMensagem status={item.status} rotulo={item.statusRotulo} />
                {item.motivo ? <p className="mt-1 max-w-xs text-xs text-muted">{item.motivo}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetalheMensagem({ mensagem, hrefConversa }: { mensagem: MensagemDetalhe; hrefConversa: string }) {
  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-5" aria-labelledby="detalhe-mensagem">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">Detalhe</p>
          <h2 id="detalhe-mensagem" className="mt-1 font-display text-2xl">
            {mensagem.cliente}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {formatarData(mensagem.quando)} · {mensagem.canalRotulo} · {mensagem.envio}
          </p>
        </div>
        <SeloStatusMensagem status={mensagem.status} rotulo={mensagem.statusRotulo} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Cobrança</dt>
          <dd>
            <Link href={`/faturas/${mensagem.faturaId}`} className="text-canopy hover:underline">
              {mensagem.fatura}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Destino</dt>
          <dd>{mensagem.destino || "Ainda sem destino"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Identificador da Twilio</dt>
          <dd className="break-all">{mensagem.messageSid || "Ainda não aceita pela Twilio"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Tentativas</dt>
          <dd>{mensagem.tentativas}</dd>
        </div>
      </dl>
      {mensagem.motivo ? <p className="mt-4 text-sm leading-6">{mensagem.motivo}</p> : null}
      {mensagem.eventos.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {mensagem.eventos.map((evento) => (
            <li key={`${evento.quando}-${evento.rotulo}`} className="text-sm text-muted">
              {formatarData(evento.quando)} · {rotuloStatusTwilio(evento.rotulo)}
              {evento.detalhe ? ` · ${evento.detalhe}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">A Twilio ainda não devolveu um status desta mensagem.</p>
      )}
      {mensagem.telefone ? (
        <p className="mt-4">
          <Link href={hrefConversa} className="text-sm font-medium text-canopy hover:underline">
            Abrir conversa
          </Link>
        </p>
      ) : null}
    </section>
  );
}
