import { forbidden } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelResultado } from "@/components/painel-resultado";
import { podeVerResultado } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterResultado } from "@/server/services/resultado-service";

export const metadata = { title: "Resultado" };

export default async function PaginaResultado() {
  const acesso = await acessoDaPagina();
  if (!podeVerResultado(acesso.papel)) forbidden();
  const resultado = await obterResultado(acesso);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Resultado"
        descricao="Custo e faturamento dos serviços vendidos que estão ativos, de clientes ativos ou em implantação. A alíquota do catálogo incide sobre o valor combinado."
      />
      <PainelResultado mensal={resultado.mensal} avulso={resultado.avulso} />
    </>
  );
}
