"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarReais } from "@/lib/dinheiro";
import { formatarTaxa } from "@/lib/painel-financeiro";
import type { PontoBoca } from "@/lib/boca-jacare";

const COR_FATURADO = "#0B3861";
const COR_RECEBIDO = "#36679D";
const COR_INADIMPLENTE = "#C7922E";
const COR_A_VENCER = "#B7CDE4";
const COR_OUTROS = "#E6EEF6";

function rotuloEixoY(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (absoluto >= 10_000) {
    return `R$ ${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  }
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function pontoDoTooltip(payload: ReadonlyArray<{ payload?: unknown }> | undefined): PontoBoca | null {
  const bruto = payload?.[0]?.payload;
  if (!bruto || typeof bruto !== "object" || !("mes" in bruto) || !("faturado" in bruto)) return null;
  return bruto as PontoBoca;
}

function TooltipBoca({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
  const ponto = active ? pontoDoTooltip(payload) : null;
  if (!ponto) return null;
  return (
    <div className="max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink shadow-lg">
      <p className="font-medium">{ponto.rotulo}</p>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <dt>Faturado</dt>
          <dd className="tabular-nums">{formatarReais(ponto.faturado)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Recebido</dt>
          <dd className="tabular-nums">{formatarReais(ponto.recebido)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Inadimplente</dt>
          <dd className="tabular-nums">{formatarReais(ponto.inadimplente)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Inadimplência</dt>
          <dd className="tabular-nums">{formatarTaxa(ponto.taxa)}</dd>
        </div>
        {ponto.aVencer !== "0.00" ? (
          <div className="flex justify-between gap-4">
            <dt>Ainda não venceu</dt>
            <dd className="tabular-nums">{formatarReais(ponto.aVencer)}</dd>
          </div>
        ) : null}
      </dl>
      {ponto.nota ? <p className="mt-2 text-xs leading-5 text-muted">{ponto.nota}</p> : null}
    </div>
  );
}

export function GraficoBocaJacare({
  pontos,
  mostrarOutros,
}: {
  pontos: PontoBoca[];
  mostrarOutros: boolean;
}) {
  return (
    <div
      className="mt-4 overflow-x-auto"
      tabIndex={0}
      aria-label="Gráfico da boca de jacaré. Role na horizontal para ver todos os meses."
    >
      <div className="h-80 w-full min-w-[720px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={pontos}
            margin={{ top: 12, right: 36, left: 0, bottom: 4 }}
            accessibilityLayer
            desc="Linha azul-escura é o faturado. Linha azul-clara é o recebido. A faixa dourada entre elas é a inadimplência, em aberto e já vencida. A faixa clara é o que ainda não venceu."
          >
            <CartesianGrid stroke="#D5DEE8" vertical={false} />
            <XAxis
              dataKey="rotuloEixo"
              tick={{ fill: "#5A6B80", fontSize: 12 }}
              interval={0}
              padding={{ left: 12, right: 28 }}
              height={32}
            />
            <YAxis
              tickFormatter={rotuloEixoY}
              tick={{ fill: "#5A6B80", fontSize: 12 }}
              width={88}
              domain={[0, "auto"]}
            />
            <Tooltip content={<TooltipBoca />} cursor={{ stroke: "#D5DEE8" }} />
            <Area
              dataKey="recebidoNum"
              stackId="boca"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              dataKey="inadimplenteNum"
              stackId="boca"
              stroke="none"
              fill={COR_INADIMPLENTE}
              fillOpacity={0.45}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              dataKey="aVencerNum"
              stackId="boca"
              stroke="none"
              fill={COR_A_VENCER}
              fillOpacity={0.95}
              isAnimationActive={false}
              legendType="none"
            />
            {mostrarOutros ? (
              <Area
                dataKey="outrosNum"
                stackId="boca"
                stroke="none"
                fill={COR_OUTROS}
                isAnimationActive={false}
                legendType="none"
              />
            ) : null}
            <Line
              dataKey="faturadoNum"
              name="Faturado"
              stroke={COR_FATURADO}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COR_FATURADO }}
              isAnimationActive={false}
            />
            <Line
              dataKey="recebidoNum"
              name="Recebido"
              stroke={COR_RECEBIDO}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COR_RECEBIDO }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
