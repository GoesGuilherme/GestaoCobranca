import { forbidden } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelMetricas } from "@/components/painel-metricas";
import { podeVerMetricas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterMetricas } from "@/server/services/metricas-service";

export const metadata = { title: "Métricas" };

export default async function PaginaMetricas() {
  const acesso = await acessoDaPagina();
  if (!podeVerMetricas(acesso.papel)) forbidden();
  const metricas = await obterMetricas(acesso);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Métricas"
        descricao="Valor mensal recorrente, saída de clientes e quanto um cliente vale ao longo do tempo. A conta usa a data de ativação. Cada empresa vê só as próprias mensalidades. Cobrança única fica de fora."
      />
      <PainelMetricas metricas={metricas} />
    </>
  );
}
