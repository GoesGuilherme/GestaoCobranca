import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { EstadoVazio } from "@/components/estado-vazio";
import { Selo } from "@/components/selo";
import { classeBotaoPrimario } from "@/components/estilos";
import { formatarReais } from "@/lib/dinheiro";
import { formatarNumero } from "@/lib/formatacao";
import { rotuloSegmento } from "@/lib/rotulos";
import type { Segmento, StatusCliente } from "@/lib/tipos";
import { cnpjCollabPendente } from "@/lib/collab";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainel } from "@/server/services/painel-service";

export const metadata = { title: "Painel" };

const ordemStatus: StatusCliente[] = ["ATIVO", "EM_IMPLANTACAO", "INATIVO", "BLOQUEADO"];
const ordemSegmento: Segmento[] = ["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"];

const TEXTO_STATUS: Record<StatusCliente, { linha: string; dica: string }> = {
  ATIVO: { linha: "Quantidade de clientes ativos", dica: "Clientes que estão ativos nesta empresa." },
  EM_IMPLANTACAO: {
    linha: "Quantidade de clientes em implantação",
    dica: "Clientes que ainda estão sendo implantados.",
  },
  INATIVO: { linha: "Quantidade de clientes inativos", dica: "Clientes que não estão mais ativos." },
  BLOQUEADO: { linha: "Quantidade de clientes bloqueados", dica: "Clientes com o acesso bloqueado." },
};

function Dica({ id, texto, clara = false }: { id: string; texto: string; clara?: boolean }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        className={`inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] font-semibold leading-none ${clara ? "border-white/40 text-white" : "border-current/30"}`}
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

export default async function PaginaPainel() {
  const acesso = await acessoDaPagina();
  const painel = await obterPainel(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho="Visão geral"
        titulo="Painel"
        descricao="Quantos clientes estão ativos, em implantação, parados ou bloqueados, em qual segmento, e quanto está contratado por mês."
        acao={
          <Link href="/clientes/novo" className={classeBotaoPrimario}>
            Novo cliente
          </Link>
        }
      />

      {acesso.papel === "DONO" && cnpjCollabPendente(acesso.cnpjEmpresa) ? (
        <p className="mb-6 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          O CNPJ da {acesso.nomeEmpresa} ainda é um placeholder.{" "}
          <Link href="/empresa" className="font-medium text-canopy hover:underline">
            Informe o CNPJ real
          </Link>
          .
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-3xl bg-forest px-5 py-6 text-paper sm:col-span-2">
          <p className="text-sm text-white/90">
            Clientes
            <Dica id="dica-painel-clientes" texto="Total de clientes cadastrados nesta empresa." clara />
          </p>
          <p className="mt-2 font-display text-6xl">{formatarNumero(painel.totalClientes)}</p>
          <p className="mt-2 text-sm text-white/90">Quantidade de clientes cadastrados</p>
          <p className="mt-3 text-sm text-white/85">
            {formatarNumero(painel.totalFiliais)}{" "}
            {painel.totalFiliais === 1 ? "filial cadastrada" : "filiais cadastradas"}
          </p>
          <p className="mt-1 text-sm text-white/85">
            Valor mensal dos serviços ativos: {formatarReais(painel.receitaMensal)}
          </p>
        </article>
        {ordemStatus.map((status) => (
          <article key={status} className="rounded-3xl border border-line bg-card px-5 py-6">
            <div className="flex items-center gap-1">
              <Selo valor={status} tipo="cliente" />
              <Dica id={`dica-painel-${status}`} texto={TEXTO_STATUS[status].dica} />
            </div>
            <p className="mt-4 font-display text-4xl">{formatarNumero(painel.porStatus[status])}</p>
            <p className="mt-1 text-sm text-muted">{TEXTO_STATUS[status].linha}</p>
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
                  <div className="h-2 rounded-full bg-sand" role="img" aria-label={`${rotuloSegmento(segmento)}: ${valor} clientes, ${percentual}%`}>
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
            <div className="mt-6">
              <EstadoVazio
                titulo="Nenhum cliente cadastrado ainda"
                descricao="Quando você cadastrar o primeiro cliente, ele aparece aqui."
                acao={
                  <Link href="/clientes/novo" className={classeBotaoPrimario}>
                    Novo cliente
                  </Link>
                }
              />
            </div>
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
                      {cliente.quantidadeFiliais === 1 ? "filial" : "filiais"} ·{" "}
                      {formatarReais(cliente.valorMensalAtivo)} / mês
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
