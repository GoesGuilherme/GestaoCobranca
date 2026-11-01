import Link from "next/link";
import { notFound } from "next/navigation";
import { Trilha } from "@/components/trilha";
import { BotaoExcluir } from "@/components/botao-excluir";
import { classeBotaoSecundario } from "@/components/estilos";
import { PainelFiliais } from "@/components/painel-filiais";
import { PainelServicosCliente } from "@/components/painel-servicos-cliente";
import { AvisoModoTeste } from "@/components/aviso-modo-teste";
import { PainelFaturasCliente } from "@/components/painel-faturas-cliente";
import { PainelReguaCliente } from "@/components/painel-regua-cliente";
import { PainelRecorrenciaLote } from "@/components/painel-recorrencia-lote";
import { Selo } from "@/components/selo";
import { dataHojeIso } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDocumento, formatarWhatsapp, somenteDigitos } from "@/lib/documento";
import { formatarData, formatarDataIso } from "@/lib/formatacao";
import { podeAlterarServicos, podeEmitirCobranca, podeVerCustoServico, podeVerFaturas, podeVerRegua } from "@/lib/permissoes";
import { opcoesDaReguaAplicavel, passosDaAtribuicao } from "@/lib/regua";
import type { ClienteDetalhe, ClienteServicoDTO, FaturaDTO, ServicoDTO } from "@/lib/tipos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterCliente } from "@/server/services/cliente-service";
import { listarServicosDoCliente } from "@/server/services/cliente-servico-service";
import { listarFaturas } from "@/server/services/fatura-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";
import { listarEnviosRegua } from "@/server/services/regua-envios";
import { obterPainelRegua } from "@/server/services/regua-service";
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
  const verCusto = podeVerCustoServico(acesso.papel);
  const verFaturas = podeVerFaturas(acesso.papel);
  const podeCobrar = podeEmitirCobranca(acesso.papel);
  let cliente: ClienteDetalhe;
  let vinculos: ClienteServicoDTO[];
  let catalogo: ServicoDTO[];
  let faturas: FaturaDTO[] = [];
  try {
    [cliente, vinculos, catalogo, faturas] = await Promise.all([
      obterCliente(acesso.empresaId, id),
      listarServicosDoCliente(acesso.empresaId, id, verCusto, podeCobrar),
      listarServicos(acesso.empresaId, verCusto),
      verFaturas
        ? listarFaturas(acesso, { clienteId: id, situacao: "todas", ordem: "desc" })
        : Promise.resolve([]),
    ]);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 404) notFound();
    throw erro;
  }

  const [preferencias, regua, enviosRegua] = await Promise.all([
    podeCobrar ? obterPreferenciasCobranca(acesso.empresaId) : Promise.resolve(undefined),
    podeVerRegua(acesso.papel) ? obterPainelRegua(acesso) : Promise.resolve(null),
    verFaturas ? listarEnviosRegua(acesso.empresaId, faturas.map((fatura) => fatura.id)) : Promise.resolve([]),
  ]);
  const passosRegua = regua
    ? opcoesDaReguaAplicavel({ modo: cliente.reguaModo, reguaId: cliente.reguaId }, regua.reguas)
    : [];
  const passosCliente = regua
    ? passosDaAtribuicao({ modo: cliente.reguaModo, reguaId: cliente.reguaId }, regua.reguas)
    : null;
  const hoje = dataHojeIso();
  const whatsapp = somenteDigitos(cliente.whatsapp);

  return (
    <>
      <Trilha itens={[{ href: "/clientes", rotulo: "Clientes" }, { rotulo: cliente.nomeFantasia }]} />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Selo valor={cliente.segmento} tipo="segmento" />
            <Selo valor={cliente.status} tipo="cliente" />
          </div>
          <h1 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">{cliente.nomeFantasia}</h1>
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
        <Item rotulo={cliente.tipoDocumento}>{formatarDocumento(cliente.documento, cliente.tipoDocumento)}</Item>
        <Item rotulo="Contato">{cliente.contatoNome}</Item>
        <Item rotulo="WhatsApp">
          <a className="text-canopy hover:underline" href={`https://wa.me/55${whatsapp}`}>
            {formatarWhatsapp(cliente.whatsapp)}
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
        <Item rotulo="Data de ativação">{cliente.ativadoEm ? formatarDataIso(cliente.ativadoEm) : "Não informada"}</Item>
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

      {verFaturas ? (
        <PainelFaturasCliente
          clienteId={cliente.id}
          vinculos={vinculos}
          faturas={faturas}
          podeCancelar={podeCobrar}
          preferencias={preferencias}
          passosRegua={passosRegua}
          podeEnviarRegua={podeCobrar}
          passosCliente={passosCliente}
          hoje={hoje}
          reguasEnvio={regua?.reguas}
          enviosRegua={enviosRegua}
          modoTeste={Boolean(regua?.config.gravada && regua.config.modoTeste)}
          emailLogado={acesso.email}
        />
      ) : null}

      {regua ? <AvisoModoTeste ativo={regua.config.gravada && regua.config.modoTeste} /> : null}

      <PainelReguaCliente
        clienteId={cliente.id}
        modo={cliente.reguaModo}
        reguaId={cliente.reguaId}
        pausada={cliente.reguaPausada}
        nome={cliente.reguaNome}
        reguas={regua?.reguas ?? []}
        podeEditar={podeCobrar}
      />

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

      {podeCobrar ? <PainelRecorrenciaLote clienteId={cliente.id} preferencias={preferencias} /> : null}

      <PainelFiliais
        clienteId={cliente.id}
        filiais={cliente.filiais}
        cidade={cliente.cidade}
        uf={cliente.uf}
      />
    </>
  );
}
