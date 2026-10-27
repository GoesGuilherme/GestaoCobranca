import { forbidden } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FiltrosPainelFinanceiro, PainelFinanceiroView } from "@/components/painel-financeiro";
import { lerFiltrosPainel } from "@/lib/painel-financeiro";
import { podeVerFaturas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainelFinanceiro } from "@/server/services/painel-financeiro-service";

export const metadata = { title: "Financeiro" };

type Busca = {
  periodo?: string;
  forma?: string;
  status?: string;
};

export default async function PaginaPainelFinanceiro({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) forbidden();
  const filtros = lerFiltrosPainel(params);
  const painel = await obterPainelFinanceiro(acesso, filtros);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Financeiro"
        descricao="O que está em atraso, o que entrou e o que ainda vem. A previsão de recorrência aparece separada das faturas já emitidas."
      />
      <FiltrosPainelFinanceiro filtros={filtros} />
      <PainelFinanceiroView painel={painel} />
    </>
  );
}
