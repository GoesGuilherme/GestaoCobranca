import Link from "next/link";
import { ListaPromessas } from "@/components/lista-promessas";
import { formatarNumero } from "@/lib/formatacao";
import { formatarTaxa } from "@/lib/painel-financeiro";
import { obterResumoPromessasPainel } from "@/server/services/promessa-service";

export async function SecaoPromessasPainel({ empresaId }: { empresaId: string }) {
  const resumo = await obterResumoPromessasPainel(empresaId);
  const aviso = resumo.recentes.length;

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-6" aria-labelledby="promessas-painel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="promessas-painel" className="font-display text-2xl">
            Promessas de pagamento
          </h2>
          <p className="mt-1 text-sm text-muted">Promessas que vencem hoje, as que quebraram nos últimos 14 dias e a taxa dos últimos 90 dias.</p>
        </div>
        <Link href="/promessas" className="text-sm font-medium text-canopy hover:underline">
          Ver promessas
        </Link>
      </div>
      {aviso > 0 ? (
        <p className="mt-4 rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay" role="status">
          {aviso === 1
            ? "1 promessa quebrou nos últimos 14 dias. A régua dessa fatura voltou a cobrar."
            : `${aviso} promessas quebraram nos últimos 14 dias. A régua dessas faturas voltou a cobrar.`}
        </p>
      ) : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <article className="rounded-3xl border border-line bg-white px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Hoje</p>
          <p className="mt-2 font-display text-4xl tabular-nums">{formatarNumero(resumo.vencemHoje)}</p>
          <p className="mt-2 text-sm text-muted">Promessas que vencem hoje</p>
        </article>
        <article className="rounded-3xl border border-line bg-white px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Quebradas recentes</p>
          <p className="mt-2 font-display text-4xl tabular-nums">{formatarNumero(aviso)}</p>
          <p className="mt-2 text-sm text-muted">Promessas quebradas nos últimos 14 dias</p>
        </article>
        <article className="rounded-3xl border border-line bg-white px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Taxa de cumprimento</p>
          <p className="mt-2 font-display text-4xl tabular-nums">{formatarTaxa(resumo.taxa90)}</p>
          <p className="mt-2 text-sm text-muted">
            Últimos 90 dias
            {resumo.cumpridas90 + resumo.quebradas90 > 0
              ? ` · ${resumo.cumpridas90} cumpridas e ${resumo.quebradas90} quebradas`
              : ""}
          </p>
        </article>
      </div>
      {resumo.recentes.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-medium">Quebradas recentes</h3>
          <div className="mt-3">
            <ListaPromessas promessas={resumo.recentes} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
