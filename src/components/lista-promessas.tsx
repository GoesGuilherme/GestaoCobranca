import Link from "next/link";
import { formatarReais } from "@/lib/dinheiro";
import { formatarData, formatarDataIso } from "@/lib/formatacao";
import { rotuloCanalPromessa, rotuloPromessaAte, rotuloStatusPromessa } from "@/lib/promessa";
import type { PromessaDTO } from "@/lib/tipos";

const TOM: Record<string, string> = {
  PENDENTE: "bg-gold-soft text-gold-ink",
  CUMPRIDA: "bg-leaf text-ok",
  CUMPRIDA_COM_ATRASO: "bg-gold-soft text-gold-ink",
  QUEBRADA: "bg-clay-soft text-clay",
  CANCELADA: "bg-sand text-muted",
};

export function ListaPromessas({
  promessas,
  mostrarCliente = true,
}: {
  promessas: PromessaDTO[];
  mostrarCliente?: boolean;
}) {
  if (promessas.length === 0) {
    return <p className="text-sm text-muted">Nenhuma promessa nesta lista.</p>;
  }

  return (
    <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
      {promessas.map((promessa) => (
        <li key={promessa.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            {mostrarCliente ? (
              <Link href={`/clientes/${promessa.clienteId}`} className="font-medium text-canopy hover:underline">
                {promessa.nomeCliente}
              </Link>
            ) : null}
            <p className={mostrarCliente ? "mt-1 text-sm" : "text-sm font-medium"}>
              {rotuloPromessaAte(promessa.dataPrometida)} · {formatarReais(promessa.valorPrometido)}
            </p>
            <p className="text-xs text-muted">
              Fatura de {formatarDataIso(promessa.vencimentoFatura)} · {formatarReais(promessa.valorFatura)} ·{" "}
              {rotuloCanalPromessa(promessa.canal)}
            </p>
            <p className="text-xs text-muted">
              Registrada por {promessa.registradaPor} em {formatarData(promessa.registradaEm)}
            </p>
            {promessa.observacao ? <p className="mt-1 text-sm text-ink">{promessa.observacao}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TOM[promessa.status] ?? TOM.CANCELADA}`}>
              {rotuloStatusPromessa(promessa.status)}
            </span>
            <Link href={`/faturas/${promessa.faturaId}`} className="text-sm font-medium text-canopy hover:underline">
              Abrir fatura
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
