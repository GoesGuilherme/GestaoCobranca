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
        descricao="Receita recorrente, saída de clientes e valor ao longo do tempo. O churn e o LTV usam a data de ativação do cliente. Cada empresa vê só as próprias mensalidades. Serviço avulso fica de fora."
      />
      <PainelMetricas metricas={metricas} />
    </>
  );
}
