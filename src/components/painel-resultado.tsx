"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compararDinheiro, formatarPercentual, formatarReais, formatarReaisAssinado } from "@/lib/dinheiro";
import type { BlocoResultado, LinhaResultado } from "@/lib/tipos";

type Coluna = "nome" | "faturamento" | "custo" | "impostos" | "margem" | "margemPercentual";

const colunas: { id: Coluna; rotulo: string }[] = [
  { id: "faturamento", rotulo: "Faturamento" },
  { id: "custo", rotulo: "Custo" },
  { id: "impostos", rotulo: "Impostos" },
  { id: "margem", rotulo: "Margem" },
  { id: "margemPercentual", rotulo: "Margem %" },
];

function textoPercentual(valor: string | null) {
  if (valor === null) return "—";
  return formatarPercentual(valor);
}

function compararLinhas(a: LinhaResultado, b: LinhaResultado, coluna: Coluna) {
  if (coluna === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
  if (coluna === "margemPercentual") {
    if (a.margemPercentual === null && b.margemPercentual === null) return 0;
    if (a.margemPercentual === null) return 1;
    if (b.margemPercentual === null) return -1;
    return compararDinheiro(a.margemPercentual, b.margemPercentual);
  }
  return compararDinheiro(a[coluna], b[coluna]);
}

function Cartao({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <article
      className={`rounded-3xl border px-5 py-5 ${destaque ? "border-forest bg-forest text-paper" : "border-line bg-card"}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${destaque ? "text-white/70" : "text-muted"}`}>
        {rotulo}
      </p>
      <p className="mt-2 font-display text-3xl tabular-nums">{valor}</p>
    </article>
  );
}

function Grafico({ bloco }: { bloco: BlocoResultado }) {
  const barras = [
    { rotulo: "Faturamento", valor: bloco.faturamento, cor: "bg-canopy" },
    { rotulo: "Custo", valor: bloco.custo, cor: "bg-gold" },
    { rotulo: "Margem", valor: bloco.margem, cor: bloco.margem.startsWith("-") ? "bg-clay" : "bg-forest" },
  ];
  const maior = barras.reduce((atual, barra) => {
    const comparacao = compararDinheiro(barra.valor.replace(/^-/, ""), atual);
    return comparacao > 0 ? barra.valor.replace(/^-/, "") : atual;
  }, "0.00");
  if (compararDinheiro(maior, "0.00") === 0) {
    return <p className="text-sm text-muted">Ainda não há valores para comparar.</p>;
  }

  return (
    <div className="space-y-3">
      {barras.map((barra) => {
        const absoluto = barra.valor.replace(/^-/, "");
        const largura = compararDinheiro(maior, "0.00") === 0 ? 0 : Math.round((Number(absoluto) / Number(maior)) * 100);
        return (
          <div key={barra.rotulo}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span>{barra.rotulo}</span>
              <span className="tabular-nums text-muted">{formatarReaisAssinado(barra.valor)}</span>
            </div>
            <div className="h-3 rounded-full bg-sand">
              <div className={`h-3 rounded-full ${barra.cor}`} style={{ width: `${largura}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tabela({
  rotulo,
  linhas,
  total,
}: {
  rotulo: string;
  linhas: LinhaResultado[];
  total: Pick<LinhaResultado, "faturamento" | "custo" | "impostos" | "margem" | "margemPercentual">;
}) {
  const [coluna, setColuna] = useState<Coluna>("nome");
  const [direcao, setDirecao] = useState<"asc" | "desc">("asc");
  const ordenadas = useMemo(() => {
    const copia = [...linhas].sort((a, b) => compararLinhas(a, b, coluna));
    return direcao === "asc" ? copia : copia.reverse();
  }, [linhas, coluna, direcao]);

  function ordenar(proxima: Coluna) {
    if (proxima === coluna) {
      setDirecao((atual) => (atual === "asc" ? "desc" : "asc"));
      return;
    }
    setColuna(proxima);
    setDirecao(proxima === "nome" ? "asc" : "desc");
  }

  function cabecalho(id: Coluna, texto: string, alinhado = false) {
    const ativo = coluna === id;
    return (
      <th className={`px-4 py-3 font-medium ${alinhado ? "text-right" : "text-left"}`} aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className="cursor-pointer uppercase tracking-wide hover:text-ink"
          onClick={() => ordenar(id)}
        >
          {texto}
          {ativo ? (direcao === "asc" ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  if (linhas.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            {cabecalho("nome", rotulo)}
            {colunas.map((item) => cabecalho(item.id, item.rotulo, true))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((linha) => (
            <tr key={linha.id} className="border-b border-line">
              <td className="px-4 py-3 font-medium">
                {rotulo === "Cliente" ? (
                  <Link href={`/clientes/${linha.id}`} className="hover:underline">
                    {linha.nome}
                  </Link>
                ) : (
                  linha.nome
                )}
                {linha.semCusto > 0 ? (
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {linha.semCusto === 1 ? "1 serviço sem custo" : `${linha.semCusto} serviços sem custo`}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatarReais(linha.faturamento)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatarReais(linha.custo)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatarReais(linha.impostos)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatarReaisAssinado(linha.margem)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{textoPercentual(linha.margemPercentual)}</td>
            </tr>
          ))}
          <tr className="bg-sand/70 font-semibold">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatarReais(total.faturamento)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatarReais(total.custo)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatarReais(total.impostos)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatarReaisAssinado(total.margem)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{textoPercentual(total.margemPercentual)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AvisoSemCusto({ bloco }: { bloco: BlocoResultado }) {
  if (bloco.semCusto === 0) return null;
  const texto =
    bloco.semCusto === 1
      ? "1 serviço sem custo informado."
      : `${bloco.semCusto} serviços sem custo informado.`;
  return (
    <p className="rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm">
      {texto} A margem pode estar acima do real, porque o custo vazio entra como zero.{" "}
      {bloco.clientesSemCusto.map((cliente, indice) => (
        <span key={cliente.id}>
          {indice === 0 ? "Clientes: " : ", "}
          <Link href={`/clientes/${cliente.id}`} className="font-medium text-canopy hover:underline">
            {cliente.nome}
          </Link>
        </span>
      ))}
    </p>
  );
}

function Bloco({
  titulo,
  descricao,
  bloco,
  rotuloFaturamento,
}: {
  titulo: string;
  descricao: string;
  bloco: BlocoResultado;
  rotuloFaturamento: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-3xl">{titulo}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{descricao}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Cartao rotulo={rotuloFaturamento} valor={formatarReais(bloco.faturamento)} destaque />
        <Cartao rotulo="Custo total" valor={formatarReais(bloco.custo)} />
        <Cartao rotulo="Impostos" valor={formatarReais(bloco.impostos)} />
        <Cartao rotulo="Margem" valor={formatarReaisAssinado(bloco.margem)} />
        <Cartao rotulo="Margem %" valor={textoPercentual(bloco.margemPercentual)} />
      </div>
      {bloco.quantidade === 0 ? (
        <p className="mt-4 rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
          Nenhum serviço ativo neste grupo.
        </p>
      ) : (
        <div className={`mt-4 grid gap-4 ${bloco.semCusto > 0 ? "lg:grid-cols-5" : ""}`}>
          <div className={`rounded-3xl border border-line bg-card p-5 ${bloco.semCusto > 0 ? "lg:col-span-2" : ""}`}>
            <h3 className="font-display text-2xl">Faturamento, custo e margem</h3>
            <div className="mt-4">
              <Grafico bloco={bloco} />
            </div>
          </div>
          {bloco.semCusto > 0 ? (
            <div className="lg:col-span-3">
              <AvisoSemCusto bloco={bloco} />
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-4 space-y-4">
        <Tabela rotulo="Cliente" linhas={bloco.porCliente} total={bloco} />
        <Tabela rotulo="Serviço" linhas={bloco.porServico} total={bloco} />
      </div>
    </section>
  );
}

export function PainelResultado({ mensal, avulso }: { mensal: BlocoResultado; avulso: BlocoResultado }) {
  return (
    <>
      <Bloco
        titulo="Mensal"
        descricao="Serviços recorrentes ativos, de clientes ativos ou em implantação."
        bloco={mensal}
        rotuloFaturamento="Faturamento mensal"
      />
      <Bloco
        titulo="Avulsos"
        descricao="Cobranças únicas ativas. Não entram no faturamento mensal."
        bloco={avulso}
        rotuloFaturamento="Faturamento avulso"
      />
    </>
  );
}
