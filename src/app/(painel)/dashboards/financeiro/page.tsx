import { Suspense } from "react";
import { forbidden } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FiltrosPainelFinanceiro, PainelFinanceiroView } from "@/components/painel-financeiro";
import { EsqueletoBocaJacare, SecaoBocaJacare } from "@/components/secao-boca-jacare";
import { lerHorizonteBoca } from "@/lib/boca-jacare";
import { lerFiltrosPainel, type FiltrosPainel } from "@/lib/painel-financeiro";
import { podeVerFaturas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { obterPainelFinanceiro } from "@/server/services/painel-financeiro-service";

export const metadata = { title: "Financeiro" };

type Busca = {
  periodo?: string;
  forma?: string;
  status?: string;
  boca?: string;
};

function EsqueletoPainel() {
  return (
    <div aria-busy="true" aria-live="polite" className="mt-6 space-y-6">
      <p className="sr-only">Carregando o financeiro.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {["a", "b", "c", "d", "e"].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-3xl bg-sand" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-3xl bg-sand" />
    </div>
  );
}

async function PainelFinanceiroCarregado({ autor, filtros }: { autor: AutorEmpresa; filtros: FiltrosPainel }) {
  const painel = await obterPainelFinanceiro(autor, filtros);
  return (
    <div className="mt-6">
      <PainelFinanceiroView painel={painel} />
    </div>
  );
}

export default async function PaginaFinanceiro({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) forbidden();
  const filtros = lerFiltrosPainel(params);
  const horizonte = lerHorizonteBoca(params.boca);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Financeiro"
        descricao="O que está em atraso, o que entrou e o que ainda vem. A boca de jacaré compara o faturado com o recebido por mês de vencimento."
      />
      <FiltrosPainelFinanceiro filtros={filtros} boca={params.boca} />
      <Suspense fallback={<EsqueletoBocaJacare />}>
        <SecaoBocaJacare autor={acesso} filtros={filtros} horizonte={horizonte} />
      </Suspense>
      <Suspense fallback={<EsqueletoPainel />}>
        <PainelFinanceiroCarregado autor={acesso} filtros={filtros} />
      </Suspense>
    </>
  );
}
