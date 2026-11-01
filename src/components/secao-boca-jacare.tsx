import dynamic from "next/dynamic";
import Link from "next/link";
import { EstadoVazio } from "@/components/estado-vazio";
import { classeBotaoPrimario, classeBotaoSecundario, classeCabecalhoTabela, classeTabelaRolavel } from "@/components/estilos";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { hrefBocaJacare, type BocaJacare, type HorizonteBoca, type SituacaoMesBoca } from "@/lib/boca-jacare";
import { formatarTaxa, type FiltrosPainel } from "@/lib/painel-financeiro";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { obterBocaJacare } from "@/server/services/boca-jacare-service";

const GraficoBocaJacare = dynamic(
  () => import("@/components/grafico-boca-jacare").then((mod) => mod.GraficoBocaJacare),
  {
    loading: () => <div className="mt-4 h-80 animate-pulse rounded-3xl bg-sand" aria-hidden="true" />,
  },
);

const HORIZONTES: { valor: HorizonteBoca; rotulo: string }[] = [
  { valor: 12, rotulo: "Últimos 12 meses" },
  { valor: 6, rotulo: "Últimos 6 meses" },
];

function rotuloSituacao(situacao: SituacaoMesBoca): string {
  if (situacao === "parcial") return "Em andamento";
  if (situacao === "futuro") return "Futuro";
  return "Fechado";
}

export function EsqueletoBocaJacare() {
  return (
    <section aria-busy="true" aria-live="polite" className="rounded-3xl border border-line bg-card p-5">
      <p className="sr-only">Carregando o gráfico de inadimplência.</p>
      <div className="h-8 w-56 animate-pulse rounded-full bg-sand" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-3xl bg-sand" />
        <div className="h-28 animate-pulse rounded-3xl bg-sand" />
      </div>
      <div className="mt-4 h-80 animate-pulse rounded-3xl bg-sand" />
    </section>
  );
}

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <article className="rounded-3xl border border-line bg-white px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{rotulo}</p>
      <p className="mt-2 font-display text-3xl tabular-nums text-ink">{valor}</p>
      <p className="mt-2 text-sm text-muted">{detalhe}</p>
    </article>
  );
}

export async function SecaoBocaJacare({
  autor,
  filtros,
  horizonte,
}: {
  autor: AutorEmpresa;
  filtros: FiltrosPainel;
  horizonte: HorizonteBoca;
}) {
  const dados = await obterBocaJacare(autor, horizonte);
  return <BocaJacareView dados={dados} filtros={filtros} />;
}

export function BocaJacareView({ dados, filtros }: { dados: BocaJacare; filtros: FiltrosPainel }) {
  const mostrarOutros = dados.meses.some((mes) => mes.outros !== "0.00");
  const temParcial = dados.meses.some((mes) => mes.situacao === "parcial");
  const temFuturo = dados.meses.some((mes) => mes.situacao === "futuro");

  return (
    <section aria-labelledby="boca-jacare-titulo" className="rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="boca-jacare-titulo" className="font-display text-2xl">
            Boca de jacaré
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Duas linhas por mês de vencimento: o que foi faturado e o que já entrou. A faixa dourada entre elas é a
            inadimplência, fatura em aberto que já venceu. Canceladas, estornadas e as que ainda estão sendo criadas
            ficam de fora.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período do gráfico">
          {HORIZONTES.map((item) => {
            const ligado = dados.horizonte === item.valor;
            return (
              <Link
                key={item.valor}
                href={hrefBocaJacare(filtros, item.valor)}
                aria-pressed={ligado}
                className={ligado ? classeBotaoPrimario : classeBotaoSecundario}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Cartao
          rotulo="Inadimplência atual"
          valor={formatarReais(dados.resumo.inadimplente)}
          detalhe="Tudo que está em aberto e já venceu, até hoje, nesta empresa."
        />
        <Cartao
          rotulo="Taxa atual"
          valor={formatarTaxa(dados.resumo.taxa)}
          detalhe="A inadimplência atual dividida pelo que já venceu até hoje. Sem faturamento vencido, a taxa não aparece."
        />
      </div>

      <p className="mt-4 text-sm text-muted">
        Os cartões olham a empresa inteira, até {formatarDataIso(dados.hoje)}. O gráfico olha só os meses do filtro.
        {dados.resumo.foraDoGrafico
          ? " Há inadimplência de meses que ficaram de fora deste recorte: ela entra nos cartões."
          : ""}
      </p>

      {dados.vazio ? (
        <div className="mt-4">
          <EstadoVazio
            titulo="Nenhuma fatura neste período"
            descricao="Quando houver cobrança com vencimento nestes meses, o gráfico mostra o faturado, o recebido e a faixa da inadimplência."
          />
        </div>
      ) : (
        <>
          <GraficoBocaJacare pontos={dados.meses} mostrarOutros={mostrarOutros} />
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
            <li className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 bg-forest" />
              Faturado
            </li>
            <li className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 bg-canopy" />
              Recebido
            </li>
            <li className="inline-flex items-center gap-2">
              <span className="inline-block size-3 rounded-sm bg-gold/45" />
              Inadimplente
            </li>
            <li className="inline-flex items-center gap-2">
              <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: "#B7CDE4" }} />
              Ainda não venceu
            </li>
            {mostrarOutros ? (
              <li className="inline-flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-sand" />
                Outras situações
              </li>
            ) : null}
          </ul>
          {temParcial ? (
            <p className="mt-3 text-sm text-muted">
              O mês com asterisco ainda não fechou. A taxa do mês divide o inadimplente pelo faturado daquele mês,
              inclusive o que ainda não venceu.
            </p>
          ) : null}
          {temFuturo ? (
            <p className="mt-2 text-sm text-muted">
              O mês com † ainda não começou. A faixa dourada dele só aparece se a cobrança já estiver marcada como
              vencida.
            </p>
          ) : null}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-canopy">Ver os números em tabela</summary>
            <div className={`${classeTabelaRolavel} mt-3`}>
              <table className="w-full min-w-[44rem] text-left text-sm">
                <caption className="sr-only">
                  Faturado, recebido e inadimplente por mês de vencimento, nos {dados.horizonte} meses do gráfico.
                </caption>
                <thead className={classeCabecalhoTabela}>
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Mês
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Situação
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Faturado
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Recebido
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Inadimplente
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Ainda não venceu
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Inadimplência
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.meses.map((mes) => (
                    <tr key={mes.mes} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-4 py-3 font-medium">
                        {mes.rotulo}
                      </th>
                      <td className="px-4 py-3 text-muted">{rotuloSituacao(mes.situacao)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarReais(mes.faturado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarReais(mes.recebido)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarReais(mes.inadimplente)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarReais(mes.aVencer)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatarTaxa(mes.taxa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
