import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";
import type { ClienteDetalhe } from "@/lib/tipos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterCliente } from "@/server/services/cliente-service";

export const metadata = { title: "Editar cliente" };

export default async function PaginaEditarCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  let cliente: ClienteDetalhe;
  try {
    cliente = await obterCliente(acesso.empresaId, id);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 404) notFound();
    throw erro;
  }

  return (
    <>
      <CabecalhoPagina
        olho="Edição"
        titulo={cliente.nomeFantasia}
        descricao="Altere os dados do grupo. As filiais continuam na página do cliente."
      />
      <FormularioCliente cliente={cliente} />
    </>
  );
}
