import { formatarReais } from "@/lib/dinheiro";
import { formatarNumero } from "@/lib/formatacao";
import { formatarTaxa } from "@/lib/painel-financeiro";
import type { MetricasPromessas } from "@/lib/promessa";

const DICAS = {
  abertas: "Quantidade de promessas ainda não vencidas. Não usa o período: é o que está prometido agora.",
  valor: "Soma do valor prometido que ainda está em aberto. Pode ser menor que a fatura, quando o acordo é parcial.",
  hoje: "Promessas que vencem hoje. Enquanto o dia não acaba, a régua dessa fatura continua pausada.",
  cumpridas: "Promessas cumpridas no período selecionado, no prazo ou com atraso. A conta usa o dia prometido.",
  quebradas: "Promessas quebradas no período selecionado. O dia prometido passou e a fatura não foi paga.",
  taxa: "Promessas cumpridas divididas pelas que já tiveram desfecho no período. Canceladas e as que ainda estão abertas não entram.",
};

function Dica({ id, texto }: { id: string; texto: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full border border-current/30 text-[10px] font-semibold leading-none"
        aria-describedby={id}
      >
        ?
        <span className="sr-only">O que este número significa</span>
      </button>
      <span
        id={id}
        role="tooltip"
        className="invisible absolute top-full left-0 z-30 mt-2 w-64 rounded-xl border border-line bg-white px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-ink opacity-0 shadow-lg group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {texto}
      </span>
    </span>
  );
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  dica,
  dicaId,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  dica: string;
  dicaId: string;
}) {
  return (
    <article className="rounded-3xl border border-line bg-card px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {rotulo}
        <Dica id={dicaId} texto={dica} />
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums text-ink">{valor}</p>
      <p className="mt-2 text-sm text-muted">{detalhe}</p>
    </article>
  );
}

export function CartoesPromessas({
  metricas,
  prefixoId,
}: {
  metricas: MetricasPromessas;
  prefixoId: string;
}) {
  return (
    <section aria-label="Promessas de pagamento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Cartao
        rotulo="Promessas em aberto"
        valor={formatarNumero(metricas.abertas)}
        detalhe="Quantidade de promessas ainda não vencidas"
        dica={DICAS.abertas}
        dicaId={`${prefixoId}-abertas`}
      />
      <Cartao
        rotulo="Valor prometido"
        valor={formatarReais(metricas.valorAberto)}
        detalhe="Valor total prometido em aberto"
        dica={DICAS.valor}
        dicaId={`${prefixoId}-valor`}
      />
      <Cartao
        rotulo="Vencem hoje"
        valor={formatarNumero(metricas.vencemHoje)}
        detalhe="Promessas que vencem hoje"
        dica={DICAS.hoje}
        dicaId={`${prefixoId}-hoje`}
      />
      <Cartao
        rotulo="Cumpridas no período"
        valor={formatarNumero(metricas.cumpridas)}
        detalhe="Promessas pagas no prazo ou com atraso"
        dica={DICAS.cumpridas}
        dicaId={`${prefixoId}-cumpridas`}
      />
      <Cartao
        rotulo="Quebradas no período"
        valor={formatarNumero(metricas.quebradas)}
        detalhe="Promessas que venceram sem pagamento"
        dica={DICAS.quebradas}
        dicaId={`${prefixoId}-quebradas`}
      />
      <Cartao
        rotulo="Taxa de cumprimento"
        valor={formatarTaxa(metricas.taxa)}
        detalhe="Percentual cumprido entre as que já tiveram desfecho"
        dica={DICAS.taxa}
        dicaId={`${prefixoId}-taxa`}
      />
    </section>
  );
}
