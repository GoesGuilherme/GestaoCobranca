import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoExcluir } from "@/components/botao-excluir";
import { classeBotaoSecundario } from "@/components/estilos";
import { PainelFiliais } from "@/components/painel-filiais";
import { PainelServicosCliente } from "@/components/painel-servicos-cliente";
import { Selo } from "@/components/selo";
import { formatarReais } from "@/lib/dinheiro";
import { formatarData } from "@/lib/formatacao";
import { somenteDigitos } from "@/lib/documento";
import { podeAlterarServicos } from "@/lib/permissoes";
import type { ClienteDetalhe, ClienteServicoDTO, ServicoDTO } from "@/lib/tipos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterCliente } from "@/server/services/cliente-service";
import { listarServicosDoCliente } from "@/server/services/cliente-servico-service";
import { listarServicos } from "@/server/services/servico-service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  try {
    const cliente = await obterCliente(acesso.empresaId, id);
    return { title: cliente.nomeFantasia };
  } catch {
    return { title: "Cliente" };
  }
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{rotulo}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
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

  const whatsapp = somenteDigitos(cliente.whatsapp);

  return (
    <>
      <Link href="/clientes" className="text-sm font-medium text-canopy">
        Voltar para clientes
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Selo valor={cliente.segmento} tipo="segmento" />
            <Selo valor={cliente.status} tipo="cliente" />
          </div>
          <h1 className="mt-3 font-display text-4xl tracking-tight">{cliente.nomeFantasia}</h1>
          <p className="mt-2 text-muted">{cliente.razaoSocial}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/clientes/${cliente.id}/editar`} className={classeBotaoSecundario}>
            Editar
          </Link>
          <BotaoExcluir
            url={`/api/clientes/${cliente.id}`}
            redirecionar="/clientes"
            mensagem={`Excluir ${cliente.nomeFantasia}? As filiais e os serviços vendidos a este cliente também serão apagados. O catálogo de serviços da empresa permanece. Esta ação não pode ser desfeita.`}
          />
        </div>
      </div>

      <dl className="mt-8 grid gap-5 rounded-3xl border border-line bg-card p-6 sm:grid-cols-2 lg:grid-cols-3">
        <Item rotulo={cliente.tipoDocumento}>{cliente.documento}</Item>
        <Item rotulo="Contato">{cliente.contatoNome}</Item>
        <Item rotulo="WhatsApp">
          <a className="text-canopy hover:underline" href={`https://wa.me/55${whatsapp}`}>
            {cliente.whatsapp}
          </a>
        </Item>
        <Item rotulo="E-mail">
          <a className="hover:underline" href={`mailto:${cliente.email}`}>
            {cliente.email}
          </a>
        </Item>
        <Item rotulo="Cidade">
          {cliente.cidade}/{cliente.uf}
        </Item>
        <Item rotulo="Filiais">{cliente.quantidadeFiliais}</Item>
        <Item rotulo="Mensal ativo">{formatarReais(cliente.valorMensalAtivo)}</Item>
      </dl>

      {cliente.observacoes ? (
        <section className="mt-4 rounded-3xl border border-line bg-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Observações</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{cliente.observacoes}</p>
        </section>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        Cadastrado em {formatarData(cliente.criadoEm)} · Atualizado em {formatarData(cliente.atualizadoEm)}
      </p>

      <PainelServicosCliente
        clienteId={cliente.id}
        vinculos={vinculos}
        catalogo={catalogo}
        podeEditar={podeAlterarServicos(acesso.papel)}
      />

      <PainelFiliais
        clienteId={cliente.id}
        filiais={cliente.filiais}
        cidade={cliente.cidade}
        uf={cliente.uf}
      />
    </>
  );
}
