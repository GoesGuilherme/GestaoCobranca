import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelCatalogoServicos } from "@/components/painel-catalogo-servicos";
import { podeAlterarServicos } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarServicos } from "@/server/services/servico-service";

export const metadata = { title: "Serviços" };

export default async function PaginaServicos() {
  const acesso = await acessoDaPagina();
  const servicos = await listarServicos(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Serviços"
        descricao="Catálogo do que esta empresa vende. O preço padrão entra como sugestão; o valor combinado com cada cliente fica na página dele."
      />
      <PainelCatalogoServicos servicos={servicos} podeEditar={podeAlterarServicos(acesso.papel)} />
    </>
  );
}
