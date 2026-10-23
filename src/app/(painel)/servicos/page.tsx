import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelCatalogoServicos } from "@/components/painel-catalogo-servicos";
import { podeAlterarServicos, podeVerCustoServico } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarServicos } from "@/server/services/servico-service";

export const metadata = { title: "Serviços" };

export default async function PaginaServicos() {
  const acesso = await acessoDaPagina();
  const verCusto = podeVerCustoServico(acesso.papel);
  const servicos = await listarServicos(acesso.empresaId, verCusto);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Serviços"
        descricao="Catálogo do que esta empresa vende. Custo e alíquota de impostos são opcionais. A margem fica visível para o dono e o financeiro."
      />
      <PainelCatalogoServicos servicos={servicos} podeEditar={podeAlterarServicos(acesso.papel)} />
    </>
  );
}
