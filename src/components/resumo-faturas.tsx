import type { TomFatura } from "@/lib/fatura-situacao";
import { formatarReais } from "@/lib/dinheiro";
import {
  resumoFaturasFiltradas,
  textoQuantidadeFaturas,
  textoTotalFiltrado,
  type FaturaParaResumo,
} from "@/lib/resumo-faturas";

const COR_ROTULO: Record<TomFatura, string> = {
  aberto: "text-gold-ink",
  vencida: "text-clay",
  paga: "text-canopy",
  cancelada: "text-muted",
  estorno: "text-ink",
};

export function ResumoFaturas({ faturas }: { faturas: FaturaParaResumo[] }) {
  const resumo = resumoFaturasFiltradas(faturas);
  const separaVencidas =
    resumo.grupos.some((grupo) => grupo.tom === "aberto") && resumo.grupos.some((grupo) => grupo.tom === "vencida");

  return (
    <section aria-labelledby="total-faturas-filtradas" className="mb-6 rounded-3xl border border-line bg-card px-5 py-5">
      <h2 id="total-faturas-filtradas" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Total das faturas filtradas
      </h2>
      <p className="mt-2 font-display text-3xl tabular-nums text-forest">{formatarReais(resumo.total)}</p>
      <p className="mt-2 text-sm text-muted">{textoTotalFiltrado(resumo.quantidade)}</p>
      {resumo.grupos.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumo.grupos.map((grupo) => (
            <div key={grupo.tom}>
              <dt className={`text-xs font-semibold uppercase tracking-[0.14em] ${COR_ROTULO[grupo.tom]}`}>{grupo.rotulo}</dt>
              <dd className="mt-1 font-display text-xl tabular-nums text-ink">{formatarReais(grupo.total)}</dd>
              <p className="text-xs text-muted">{textoQuantidadeFaturas(grupo.quantidade)}</p>
            </div>
          ))}
        </dl>
      ) : null}
      {separaVencidas ? (
        <p className="mt-3 text-xs text-muted">
          Em aberto é o que ainda não venceu. As vencidas ficam separadas e as duas entram no total.
        </p>
      ) : null}
    </section>
  );
}
