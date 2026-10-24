import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";
import { PainelServicosCliente } from "@/components/painel-servicos-cliente";
import { podeAlterarServicos, podeEmitirCobranca, podeVerCustoServico } from "@/lib/permissoes";
import type { ClienteDetalhe, ClienteServicoDTO, ServicoDTO } from "@/lib/tipos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterCliente } from "@/server/services/cliente-service";
import { listarServicosDoCliente } from "@/server/services/cliente-servico-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";
import { listarServicos } from "@/server/services/servico-service";

export const metadata = { title: "Editar cliente" };

export default async function PaginaEditarCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  const verCusto = podeVerCustoServico(acesso.papel);
  const podeCobrar = podeEmitirCobranca(acesso.papel);
  let cliente: ClienteDetalhe;
  let vinculos: ClienteServicoDTO[];
  let catalogo: ServicoDTO[];
  try {
    [cliente, vinculos, catalogo] = await Promise.all([
      obterCliente(acesso.empresaId, id),
      listarServicosDoCliente(acesso.empresaId, id, verCusto, podeCobrar),
      listarServicos(acesso.empresaId, verCusto),
    ]);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 404) notFound();
    throw erro;
  }

  const preferencias = podeCobrar ? await obterPreferenciasCobranca(acesso.empresaId) : undefined;

  return (
    <>
      <CabecalhoPagina
        olho="Edição"
        titulo={cliente.nomeFantasia}
        descricao="Altere os dados do cliente. Os serviços vendidos ficam nesta página e na ficha. As unidades continuam na ficha."
      />
      <FormularioCliente cliente={cliente} />
      <PainelServicosCliente
        clienteId={cliente.id}
        vinculos={vinculos}
        catalogo={catalogo}
        podeEditar={podeAlterarServicos(acesso.papel)}
        podeCobrar={podeCobrar}
        nomeCliente={cliente.nomeFantasia}
        whatsapp={cliente.whatsapp}
        email={cliente.email}
        preferencias={preferencias}
      />
    </>
  );
}
