import Link from "next/link";
import { formatarReais, normalizarDinheiro } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  formatarTaxa,
  PERIODOS_PAINEL,
  type FiltrosPainel,
  type PainelFinanceiro,
} from "@/lib/painel-financeiro";
import { FORMAS_COBRANCA, rotuloFormaCobranca, STATUS_CLIENTE } from "@/lib/rotulos";
import { classeBotaoPrimario, classeCampo } from "./estilos";

const DICAS = {
  atraso:
    "Faturas vencidas (OVERDUE ou em negativação) e as em aberto (PENDING ou em análise de risco) com vencimento anterior a hoje, no fuso de São Paulo. Canceladas e estornos ficam de fora. Os dias contam desde o vencimento.",
  recebido:
    "Faturas RECEIVED, CONFIRMED, RECEIVED_IN_CASH ou recebidas após negativação (DUNNING_RECEIVED) cuja última atualização cai no período. O Asaas não guarda a data do pagamento nesta tela; usamos a última atualização, que também muda se a fatura for editada.",
  receber:
    "Faturas em aberto que ainda não venceram, com vencimento dentro do período. Não inclui o que já foi pago nem a previsão das assinaturas.",
  previsto:
    "Sempre o mês que vem, independente do filtro de período. Soma as faturas já emitidas e ainda não recebidas com a previsão das assinaturas mensais ativas no Asaas que ainda não geraram fatura naquele mês. A previsão não é uma cobrança emitida.",
  taxa:
    "Valor em atraso com vencimento no período, dividido pelo valor de todas as faturas do período que não foram canceladas nem estornadas. Se não houve faturamento, a taxa não aparece.",
  grafico:
    "Cada barra é o mês de vencimento: recebido, em atraso e a receber das faturas emitidas, mais a previsão da recorrência ainda não gerada. A linha é a inadimplência daquele mês (atraso dividido pelo que foi emitido). O cartão de recebido usa a data da atualização, então pode não coincidir com a barra.",
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

function centavosDe(texto: string): bigint {
  const normal = normalizarDinheiro(texto) ?? "0.00";
  const [inteiro, frac] = normal.split(".");
  return BigInt(inteiro) * BigInt(100) + BigInt(frac);
}

function textoAtraso(quantidade: number, dias: number | null): string {
  if (quantidade === 0 || dias === null) return "Nenhuma fatura em atraso";
  const faturas = quantidade === 1 ? "1 fatura" : `${quantidade} faturas`;
  if (dias === 0) return `${faturas} · vence hoje`;
  if (dias === 1) return `${faturas} · a mais antiga há 1 dia`;
  return `${faturas} · a mais antiga há ${dias} dias`;
}

export function FiltrosPainelFinanceiro({ filtros }: { filtros: FiltrosPainel }) {
  return (
    <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Período</span>
        <select name="periodo" defaultValue={filtros.periodo} className={classeCampo}>
          {PERIODOS_PAINEL.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Forma</span>
        <select name="forma" defaultValue={filtros.forma ?? ""} className={classeCampo}>
          <option value="">Todas</option>
          {FORMAS_COBRANCA.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Status do cliente</span>
        <select name="status" defaultValue={filtros.statusCliente ?? ""} className={classeCampo}>
          <option value="">Todos</option>
          {STATUS_CLIENTE.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={classeBotaoPrimario}>
        Filtrar
      </button>
    </form>
  );
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  dica,
  dicaId,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  dica: string;
  dicaId: string;
  tom?: "neutro" | "atraso" | "recebido" | "previsao";
}) {
  const moldura =
    tom === "atraso"
      ? "border-clay/30 bg-clay-soft"
      : tom === "recebido"
        ? "border-canopy/30 bg-white"
        : tom === "previsao"
          ? "border-gold/40 bg-gold-soft"
          : "border-line bg-card";
  return (
    <article className={`rounded-3xl border px-5 py-5 ${moldura}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {rotulo}
        <Dica id={dicaId} texto={dica} />
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums text-ink">{valor}</p>
      <p className="mt-2 text-sm text-muted">{detalhe}</p>
    </article>
  );
}

const SERIES = [
  { chave: "recebido", rotulo: "Recebido", cor: "#2f6a52" },
  { chave: "atraso", rotulo: "Em atraso", cor: "#a33b24" },
  { chave: "aReceber", rotulo: "A receber", cor: "#a97816" },
  { chave: "previsao", rotulo: "Previsão", cor: "#8fb39a" },
] as const;

function Grafico({ painel }: { painel: PainelFinanceiro }) {
  const largura = 760;
  const topo = 16;
  const base = 196;
  const alturaUtil = base - topo;
  const esquerda = 8;
  const direita = 36;
  const passo = (largura - esquerda - direita) / painel.meses.length;
  const maximo = painel.meses.reduce((maior, mes) => {
    const soma = centavosDe(mes.recebido) + centavosDe(mes.atraso) + centavosDe(mes.aReceber) + centavosDe(mes.previsao);
    return soma > maior ? soma : maior;
  }, BigInt(0));
  const tudoZero = maximo === BigInt(0);

  function altura(valor: string): number {
    if (maximo === BigInt(0)) return 0;
    return Number((centavosDe(valor) * BigInt(alturaUtil)) / maximo);
  }

  const segmentos: string[] = [];
  let atual = "";
  painel.meses.forEach((mes, indice) => {
    if (mes.inadimplencia === null) {
      if (atual) segmentos.push(atual);
      atual = "";
      return;
    }
    const x = esquerda + passo * indice + passo / 2;
    const y = base - (Number(mes.inadimplencia) / 100) * alturaUtil;
    atual = atual ? `${atual} ${x},${y}` : `${x},${y}`;
  });
  if (atual) segmentos.push(atual);

  return (
    <section className="rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">
            Por mês de vencimento
            <Dica id="dica-grafico" texto={DICAS.grafico} />
          </h2>
          <p className="mt-1 text-sm text-muted">Últimos 12 meses e os 3 seguintes. Meses sem movimento continuam no eixo.</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${largura} 236`}
          className="h-auto min-w-[720px]"
          role="img"
          aria-label="Barras de recebido, em atraso, a receber e previsão por mês de vencimento"
        >
          <line x1={esquerda} y1={base} x2={largura - direita} y2={base} stroke="#e4ddd0" />
          {painel.meses.map((mes, indice) => {
            const x = esquerda + passo * indice + (passo - passo * 0.62) / 2;
            const larguraBarra = passo * 0.62;
            const partes = [
              { cor: SERIES[0].cor, altura: altura(mes.recebido) },
              { cor: SERIES[1].cor, altura: altura(mes.atraso) },
              { cor: SERIES[2].cor, altura: altura(mes.aReceber) },
              { cor: SERIES[3].cor, altura: altura(mes.previsao) },
            ];
            let y = base;
            return (
              <g key={mes.mes}>
                {partes.map((parte) => {
                  y -= parte.altura;
                  if (parte.altura <= 0) return null;
                  return <rect key={parte.cor} x={x} y={y} width={larguraBarra} height={parte.altura} fill={parte.cor} rx="2" />;
                })}
                <text x={esquerda + passo * indice + passo / 2} y="220" textAnchor="middle" fontSize="10" fill="#6d655c">
                  {mes.rotulo}
                </text>
              </g>
            );
          })}
          {segmentos.map((pontos) =>
            pontos.includes(" ") ? (
              <polyline key={pontos} points={pontos} fill="none" stroke="#1e3d32" strokeWidth="2" />
            ) : (
              <circle key={pontos} cx={pontos.split(",")[0]} cy={pontos.split(",")[1]} r="3" fill="#1e3d32" />
            ),
          )}
          <text x={largura - 4} y={topo + 8} textAnchor="end" fontSize="10" fill="#6d655c">
            100%
          </text>
          <text x={largura - 4} y={base} textAnchor="end" fontSize="10" fill="#6d655c">
            0%
          </text>
        </svg>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
        {SERIES.map((serie) => (
          <li key={serie.chave} className="inline-flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: serie.cor }} />
            {serie.rotulo}
          </li>
        ))}
        <li className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 bg-forest" />
          Inadimplência
        </li>
      </ul>
      {tudoZero ? <p className="mt-3 text-sm text-muted">Nenhuma fatura nem previsão neste horizonte.</p> : null}
    </section>
  );
}

export function PainelFinanceiroView({ painel }: { painel: PainelFinanceiro }) {
  const vazio =
    painel.emAtraso.quantidade === 0 &&
    painel.recebido.valor === "0.00" &&
    painel.aReceber.valor === "0.00" &&
    painel.previstoProximoMes.total === "0.00" &&
    painel.topAtraso.length === 0 &&
    painel.proximos.length === 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Vencimentos de {formatarDataIso(painel.periodo.inicio)} a {formatarDataIso(painel.periodo.fim)}. O recebido usa a
        data da última atualização da fatura.
      </p>
      {vazio ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-3 text-sm text-muted">
          Ainda não há faturas nem previsão neste recorte. Os cartões ficam em zero até a primeira cobrança.
        </p>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Cartao
          rotulo="Em atraso"
          valor={formatarReais(painel.emAtraso.valor)}
          detalhe={textoAtraso(painel.emAtraso.quantidade, painel.emAtraso.diasMaisAntigo)}
          dica={DICAS.atraso}
          dicaId="dica-atraso"
          tom="atraso"
        />
        <Cartao
          rotulo={painel.rotuloRecebido}
          valor={formatarReais(painel.recebido.valor)}
          detalhe="Pelo dia em que a fatura foi atualizada"
          dica={DICAS.recebido}
          dicaId="dica-recebido"
          tom="recebido"
        />
        <Cartao
          rotulo={painel.rotuloAReceber}
          valor={formatarReais(painel.aReceber.valor)}
          detalhe="Em aberto e ainda no prazo"
          dica={DICAS.receber}
          dicaId="dica-receber"
        />
        <Cartao
          rotulo={`Previsto em ${painel.previstoProximoMes.rotulo}`}
          valor={formatarReais(painel.previstoProximoMes.total)}
          detalhe={`${formatarReais(painel.previstoProximoMes.emitido)} em faturas já emitidas · ${formatarReais(painel.previstoProximoMes.previsao)} previsão de recorrência`}
          dica={DICAS.previsto}
          dicaId="dica-previsto"
          tom="previsao"
        />
        <Cartao
          rotulo="Taxa de inadimplência"
          valor={formatarTaxa(painel.inadimplencia)}
          detalhe="Atraso sobre o faturado no período"
          dica={DICAS.taxa}
          dicaId="dica-taxa"
        />
      </section>
      <Grafico painel={painel} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl">Clientes em atraso</h2>
          {painel.topAtraso.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nenhum cliente em atraso.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {painel.topAtraso.map((cliente) => (
                <li key={cliente.clienteId} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/clientes/${cliente.clienteId}`} className="font-medium hover:underline">
                      {cliente.nome}
                    </Link>
                    <p className="text-sm text-muted">
                      {cliente.dias === 1 ? "há 1 dia" : `há ${cliente.dias} dias`}
                    </p>
                  </div>
                  <p className="tabular-nums font-medium">{formatarReais(cliente.valor)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl">Próximos recebimentos</h2>
          <p className="mt-1 text-sm text-muted">Faturas em aberto que vencem nos próximos 30 dias.</p>
          {painel.proximos.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nenhum recebimento nos próximos 30 dias.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {painel.proximos.map((fatura) => (
                <li key={fatura.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/clientes/${fatura.clienteId}`} className="font-medium hover:underline">
                      {fatura.nome}
                    </Link>
                    <p className="text-sm text-muted">
                      {formatarDataIso(fatura.vencimento)} · {rotuloFormaCobranca(fatura.forma)}
                    </p>
                  </div>
                  <p className="tabular-nums font-medium">{formatarReais(fatura.valor)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
