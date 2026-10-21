import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { Selo } from "@/components/selo";
import { classeBotaoPrimario } from "@/components/estilos";
import { formatarNumero } from "@/lib/formatacao";
import { rotuloSegmento, rotuloStatusCliente } from "@/lib/rotulos";
import type { Segmento, StatusCliente } from "@/lib/tipos";
import { obterPainel } from "@/server/services/painel-service";

export const metadata = { title: "Painel" };

const ordemStatus: StatusCliente[] = ["ATIVO", "EM_IMPLANTACAO", "INATIVO"];
const ordemSegmento: Segmento[] = ["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"];

export default async function PaginaPainel() {
  const painel = await obterPainel();

  return (
    <>
      <CabecalhoPagina
        olho="Visão geral"
        titulo="Painel"
        descricao="Quantos clientes estão ativos, em implantação ou parados, e em qual segmento."
        acao={
          <Link href="/clientes/novo" className={classeBotaoPrimario}>
            Novo cliente
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-3xl bg-forest px-5 py-6 text-paper sm:col-span-2">
          <p className="text-sm text-white/70">Clientes</p>
          <p className="mt-2 font-display text-6xl">{formatarNumero(painel.totalClientes)}</p>
          <p className="mt-2 text-sm text-white/70">
            {formatarNumero(painel.totalFiliais)}{" "}
            {painel.totalFiliais === 1 ? "filial cadastrada" : "filiais cadastradas"}
          </p>
        </article>
        {ordemStatus.map((status) => (
          <article key={status} className="rounded-3xl border border-line bg-card px-5 py-6">
            <Selo valor={status} tipo="cliente" />
            <p className="mt-4 font-display text-4xl">{formatarNumero(painel.porStatus[status])}</p>
            <p className="mt-1 text-sm text-muted">{rotuloStatusCliente(status)}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-5">
        <article className="rounded-3xl border border-line bg-card p-6 lg:col-span-2">
          <h2 className="font-display text-2xl">Por segmento</h2>
          <div className="mt-5 space-y-4">
            {ordemSegmento.map((segmento) => {
              const valor = painel.porSegmento[segmento];
              const percentual =
                painel.totalClientes === 0 ? 0 : Math.round((valor / painel.totalClientes) * 100);
              return (
                <div key={segmento}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{rotuloSegmento(segmento)}</span>
                    <span className="tabular-nums text-muted">
                      {valor} · {percentual}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-sand">
                    <div className="h-2 rounded-full bg-canopy" style={{ width: `${percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-3xl border border-line bg-card p-6 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Cadastros recentes</h2>
            <Link href="/clientes" className="text-sm font-medium text-canopy">
              Ver todos
            </Link>
          </div>
          {painel.recentes.length === 0 ? (
            <p className="mt-6 text-muted">Nenhum cliente cadastrado ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {painel.recentes.map((cliente) => (
                <li key={cliente.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/clientes/${cliente.id}`} className="font-medium hover:underline">
                      {cliente.nomeFantasia}
                    </Link>
                    <p className="text-sm text-muted">
                      {cliente.cidade}/{cliente.uf} · {cliente.quantidadeFiliais}{" "}
                      {cliente.quantidadeFiliais === 1 ? "filial" : "filiais"}
                    </p>
                  </div>
                  <Selo valor={cliente.status} tipo="cliente" />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </>
  );
}
