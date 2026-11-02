import { formatarReais } from "@/lib/dinheiro";
import { formatarMicrosPercentual, type MetricasSaas } from "@/lib/metricas-saas";

const DICAS = {
  mrr: "Soma do valor mensal dos serviços recorrentes que ainda valem hoje. Cobrança única não entra. Serviço pausado, encerrado ou de cliente inativo também não entra.",
  variacao: "Compara o valor mensal de hoje com o do fim do mês passado. Se o mês passado era zero, o percentual não aparece.",
  churnClientes:
    "Dos clientes que já estavam no fim do mês passado, a parte que saiu até hoje. Sem data de ativação, a entrada usa o início da mensalidade mais antiga.",
  churnReceita: "Do valor mensal do começo do mês, a parte que saiu. Cliente novo não entra nessa conta.",
  ticket: "Valor mensal de hoje dividido pelo número de clientes com pelo menos um serviço recorrente ativo.",
  ltv: "Valor mensal médio por cliente vezes o tempo médio que ele fica. Sem data de ativação, o tempo começa na mensalidade mais antiga. Sem base, não dá para estimar.",
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
      {metricas.clientesSemAtivacao > 0 ? (
        <p className="rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-ink">
          {metricas.clientesSemAtivacao === 1
            ? "1 cliente com mensalidade ainda não tem data de ativação."
            : `${metricas.clientesSemAtivacao} clientes com mensalidade ainda não têm data de ativação.`}{" "}
          Para esses, a entrada na conta de saída e do valor ao longo do tempo usa o início da mensalidade mais antiga.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          rotulo="MRR"
          valor={formatarReais(metricas.mrr)}
          detalhe="Valor mensal dos serviços recorrentes ativos"
          dica={DICAS.mrr}
          dicaId="dica-mrr"
          destaque
        />
        <Cartao
          rotulo="Variação"
          valor={formatarMicrosPercentual(metricas.variacao)}
          detalhe={`Diferença do valor mensal em relação ao mês passado. ${detalheVariacao(metricas)}`}
          dica={DICAS.variacao}
          dicaId="dica-variacao"
        />
        <Cartao
          rotulo="Churn de clientes"
          valor={formatarMicrosPercentual(metricas.churnClientes)}
          detalhe="Percentual de clientes que saíram neste mês"
          dica={DICAS.churnClientes}
          dicaId="dica-churn-clientes"
        />
        <Cartao
          rotulo="Churn de receita"
          valor={formatarMicrosPercentual(metricas.churnReceita)}
          detalhe="Percentual do valor mensal perdido neste mês"
          dica={DICAS.churnReceita}
          dicaId="dica-churn-receita"
        />
      </section>

      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-display text-2xl">MRR nos últimos 12 meses</h2>
        <p className="mt-1 text-sm text-muted">Cada barra é o valor mensal no fim daquele mês. A última é o de hoje.</p>
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
          <h2 className="font-display text-2xl">Como a saída de cliente é calculada</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            O cliente entra no dia em que foi ativado. Sem essa data, entra no início da mensalidade mais antiga. Sai quando a mensalidade acaba, é pausada ou cancelada, ou quando o cliente fica inativo ou bloqueado. Quem sai no dia 15 conta naquele mês. A saída de receita olha o valor mensal que deixou de valer.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Não há um histórico separado de cada mudança. A data de saída é o dia em que a mensalidade ou o cliente foi encerrado. Por isso, alterar um cadastro antigo pode mudar o mês em que a saída aparece.
          </p>
        </article>
        <div className="grid gap-4">
          <Cartao
            rotulo="Ticket médio"
            valor={metricas.ticket ? formatarReais(metricas.ticket) : "—"}
            detalhe="Valor mensal médio por cliente ativo"
            dica={DICAS.ticket}
            dicaId="dica-ticket"
          />
          <Cartao
            rotulo="LTV"
            valor={metricas.ltv ? formatarReais(metricas.ltv) : "Dados insuficientes"}
            detalhe={
              metricas.vidaMeses
                ? `Valor estimado que um cliente gera ao longo do tempo · cerca de ${metricas.vidaMeses.replace(".", ",")} meses`
                : "Valor estimado que um cliente gera ao longo do tempo. Ainda não dá para estimar."
            }
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
