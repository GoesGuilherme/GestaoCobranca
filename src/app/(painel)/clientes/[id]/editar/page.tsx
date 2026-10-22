import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";
import { PainelServicosCliente } from "@/components/painel-servicos-cliente";
import { podeAlterarServicos } from "@/lib/permissoes";
import type { ClienteDetalhe, ClienteServicoDTO, ServicoDTO } from "@/lib/tipos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterCliente } from "@/server/services/cliente-service";
import { listarServicosDoCliente } from "@/server/services/cliente-servico-service";
import { listarServicos } from "@/server/services/servico-service";

export const metadata = { title: "Editar cliente" };

export default async function PaginaEditarCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  let cliente: ClienteDetalhe;
  let vinculos: ClienteServicoDTO[];
  let catalogo: ServicoDTO[];
  try {
    [cliente, vinculos, catalogo] = await Promise.all([
      obterCliente(acesso.empresaId, id),
      listarServicosDoCliente(acesso.empresaId, id),
      listarServicos(acesso.empresaId),
    ]);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 404) notFound();
    throw erro;
  }

  return (
    <>
      <CabecalhoPagina
        olho="Edição"
        titulo={cliente.nomeFantasia}
        descricao="Altere os dados do grupo. Os serviços vendidos ficam nesta página e na ficha do cliente. As filiais continuam na ficha."
      />
      <FormularioCliente cliente={cliente} />
      <PainelServicosCliente
        clienteId={cliente.id}
        vinculos={vinculos}
        catalogo={catalogo}
        podeEditar={podeAlterarServicos(acesso.papel)}
      />
    </>
  );
}
