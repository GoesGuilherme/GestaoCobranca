import { formatarReais } from "@/lib/dinheiro";
import { formatarMicrosPercentual, type MetricasSaas } from "@/lib/metricas-saas";

const DICAS = {
  mrr: "Soma do valor mensal das mensalidades que ainda estão valendo hoje. Serviço avulso não entra. Pausa, cancelamento, cliente inativo ou bloqueado também não entram.",
  variacao: "Compara o MRR de hoje com o MRR do fim do mês passado. Se o mês passado era zero, a variação percentual não aparece.",
  churnClientes:
    "Dos clientes que tinham mensalidade no fim do mês passado, a parte que não tem mais no fechamento deste mês. Cancelou no meio do mês conta neste mês.",
  churnReceita:
    "O MRR que saiu, dividido pelo MRR do começo do mês. É a receita recorrente perdida, não o que entrou de cliente novo.",
  ticket: "MRR de hoje dividido pelo número de clientes que ainda têm pelo menos uma mensalidade ativa.",
  ltv: "Ticket médio dividido pelo churn médio dos últimos doze meses. Precisa de pelo menos seis meses com base e de algum cancelamento. Sem isso, o número iria ao infinito.",
};

export function PainelMetricas({ metricas }: { metricas: MetricasSaas }) {
  const maximo = metricas.meses.reduce((maior, mes) => {
    const centavos = centavosDe(mes.mrr);
    return centavos > maior ? centavos : maior;
  }, BigInt(0));

  return (
    <div className="space-y-6">
      {metricas.semMensalidades ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Ainda não há mensalidade nesta empresa. Quando um serviço vendido for mensal e estiver ativo, o MRR aparece aqui.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo="MRR" valor={formatarReais(metricas.mrr)} detalhe={`${metricas.clientesAtivos} ${metricas.clientesAtivos === 1 ? "cliente ativo" : "clientes ativos"}`} dica={DICAS.mrr} dicaId="dica-mrr" destaque />
        <Cartao
          rotulo="Variação"
          valor={formatarMicrosPercentual(metricas.variacao)}
          detalhe={detalheVariacao(metricas)}
          dica={DICAS.variacao}
          dicaId="dica-variacao"
        />
        <Cartao
          rotulo="Churn de clientes"
          valor={formatarMicrosPercentual(metricas.churnClientes)}
          detalhe="Neste mês, até hoje"
          dica={DICAS.churnClientes}
          dicaId="dica-churn-clientes"
        />
        <Cartao
          rotulo="Churn de receita"
          valor={formatarMicrosPercentual(metricas.churnReceita)}
          detalhe="MRR perdido sobre o início do mês"
          dica={DICAS.churnReceita}
          dicaId="dica-churn-receita"
        />
      </section>

      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">MRR nos últimos 12 meses</h2>
        <p className="mt-1 text-sm text-muted">Cada barra é o fim daquele mês. A última é o valor de hoje.</p>
        <div className="mt-6 flex h-48 items-end gap-2">
          {metricas.meses.map((mes) => {
            const altura = maximo === BigInt(0) ? 0 : Number((centavosDe(mes.mrr) * BigInt(100)) / maximo);
            return (
              <div key={mes.mes} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div className="flex h-36 w-full items-end">
                  <div className="w-full rounded-t-lg bg-forest" style={{ height: `${Math.max(altura, mes.mrr === "0.00" ? 0 : 4)}%` }} />
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted">{mes.rotulo}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl">Como o churn é calculado</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Um cliente entra na conta do mês se, no fim do mês anterior, tinha ao menos uma mensalidade valendo. Sai da conta se, no fechamento, essa mensalidade acabou, foi pausada ou cancelada, ou se o cliente ficou inativo ou bloqueado. Quem cancela no dia 15 conta naquele mês, não no seguinte. O churn de receita usa o mesmo recorte, em reais em vez de pessoas.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Não há histórico separado de cada mudança. A data de saída é a última atualização da mensalidade ou do cliente. Por isso, editar um cadastro antigo pode mudar o mês em que o churn aparece.
          </p>
        </article>
        <div className="grid gap-4">
          <Cartao
            rotulo="Ticket médio"
            valor={metricas.ticket ? formatarReais(metricas.ticket) : "—"}
            detalhe="Receita mensal por cliente ativo"
            dica={DICAS.ticket}
            dicaId="dica-ticket"
          />
          <Cartao
            rotulo="LTV"
            valor={metricas.ltv ? formatarReais(metricas.ltv) : "Dados insuficientes"}
            detalhe={metricas.vidaMeses ? `Cerca de ${metricas.vidaMeses.replace(".", ",")} meses de vida` : "Sem base para estimar a vida do cliente"}
            dica={DICAS.ltv}
            dicaId="dica-ltv"
          />
        </div>
      </section>
    </div>
  );
}

function detalheVariacao(metricas: MetricasSaas): string {
  const sinal = metricas.variacaoCentavos > BigInt(0) ? "+" : metricas.variacaoCentavos < BigInt(0) ? "−" : "";
  const absoluto = metricas.variacaoCentavos < BigInt(0) ? -metricas.variacaoCentavos : metricas.variacaoCentavos;
  const reais = formatarReais(`${absoluto / BigInt(100)}.${(absoluto % BigInt(100)).toString().padStart(2, "0")}`);
  return `${sinal}${sinal ? " " : ""}${reais} em relação a ${formatarReais(metricas.mrrAnterior)}`;
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  dica,
  dicaId,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  dica: string;
  dicaId: string;
  destaque?: boolean;
}) {
  return (
    <article className={`rounded-3xl border px-5 py-5 ${destaque ? "border-forest bg-forest text-paper" : "border-line bg-card"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${destaque ? "text-white/70" : "text-muted"}`}>
        {rotulo}
        <Dica id={dicaId} texto={dica} />
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums">{valor}</p>
      <p className={`mt-2 text-sm ${destaque ? "text-white/75" : "text-muted"}`}>{detalhe}</p>
    </article>
  );
}

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

function centavosDe(valor: string): bigint {
  const [inteiro, frac] = valor.split(".");
  return BigInt(inteiro) * BigInt(100) + BigInt(frac);
}
