import type { TomFatura } from "@/lib/fatura-situacao";
import { formatarReais } from "@/lib/dinheiro";
import type { CampoPeriodoFatura, FaixaPeriodoFatura } from "@/lib/periodo-faturas";
import { textoQuantidadeFaturas, textoTotalFiltrado, type ResumoFaturasFiltradas } from "@/lib/resumo-faturas";
import { FILTROS_VISUALIZACAO, SITUACOES_FATURA } from "@/lib/rotulos";
import type { FiltroVisualizacao, SituacaoFatura } from "@/lib/tipos";

const COR_ROTULO: Record<TomFatura, string> = {
  aberto: "text-gold-ink",
  vencida: "text-clay",
  paga: "text-canopy",
  cancelada: "text-muted",
  estorno: "text-ink",
};

export type FiltrosDoCardFaturas = {
  situacao: SituacaoFatura;
  vista: FiltroVisualizacao;
  busca: string;
  campo: CampoPeriodoFatura;
  faixa: FaixaPeriodoFatura | null;
};

function diaCurto(iso: string, comAno: boolean): string {
  const [ano, mes, dia] = iso.split("-");
  return comAno ? `${dia}/${mes}/${ano}` : `${dia}/${mes}`;
}

function textoDatas(campo: CampoPeriodoFatura, faixa: FaixaPeriodoFatura): string {
  const anos = new Set([faixa.inicio?.slice(0, 4), faixa.fim?.slice(0, 4)].filter((ano): ano is string => Boolean(ano)));
  const comAno = anos.size > 1;
  const inicio = faixa.inicio ? diaCurto(faixa.inicio, comAno) : null;
  const fim = faixa.fim ? diaCurto(faixa.fim, comAno) : null;
  const datas = inicio && fim ? `${inicio} a ${fim}` : inicio ? `a partir de ${inicio}` : fim ? `até ${fim}` : "";
  if (!datas) return "";
  return campo === "pagamento" ? `Pagamento ${datas}` : datas;
}

export function tituloCardFaturas(filtros: FiltrosDoCardFaturas): string {
  const situacao = SITUACOES_FATURA.find((item) => item.valor === filtros.situacao);
  const base =
    filtros.situacao === "todas" || !situacao
      ? "Todas as faturas"
      : `Faturas ${situacao.rotulo.toLocaleLowerCase("pt-BR")}`;
  const partes = [base];
  const busca = filtros.busca.trim();
  if (busca) partes.push(busca);
  if (filtros.vista !== "todas") {
    const vista = FILTROS_VISUALIZACAO.find((item) => item.valor === filtros.vista);
    if (vista) partes.push(vista.rotulo);
  }
  if (filtros.faixa) {
    const datas = textoDatas(filtros.campo, filtros.faixa);
    if (datas) partes.push(datas);
  }
  return partes.join(" · ");
}

export function ResumoFaturas({ resumo, filtros }: { resumo: ResumoFaturasFiltradas; filtros: FiltrosDoCardFaturas }) {
  const separaVencidas =
    resumo.grupos.some((grupo) => grupo.tom === "aberto") && resumo.grupos.some((grupo) => grupo.tom === "vencida");
  const titulo = tituloCardFaturas(filtros);

  return (
    <section aria-labelledby="total-faturas-filtradas" className="mb-6 rounded-3xl border border-line bg-card px-5 py-5">
      <h2 id="total-faturas-filtradas" className="text-sm font-semibold text-ink">
        {titulo}
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
