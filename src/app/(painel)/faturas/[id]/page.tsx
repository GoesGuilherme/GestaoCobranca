import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/cabecalho";
import { ListaPromessas } from "@/components/lista-promessas";
import { TabelaFaturas } from "@/components/tabela-faturas";
import { dataHojeIso } from "@/lib/data";
import { podeEmitirCobranca, podeVerFaturas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { ErroAplicacao } from "@/server/erros";
import { obterFatura } from "@/server/services/fatura-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";
import { listarPromessas } from "@/server/services/promessa-service";
import { listarEnviosRegua } from "@/server/services/regua-envios";
import { obterPainelRegua } from "@/server/services/regua-service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) return { title: "Fatura" };
  try {
    const fatura = await obterFatura(acesso, id);
    return { title: `Fatura de ${fatura.nomeCliente}` };
  } catch {
    return { title: "Fatura" };
  }
}

export default async function PaginaFatura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Faturas ficam com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver esta fatura."
      />
    );
  }

  const hoje = dataHojeIso();
  try {
    const [fatura, preferencias, regua, promessas] = await Promise.all([
      obterFatura(acesso, id),
      podeEmitirCobranca(acesso.papel) ? obterPreferenciasCobranca(acesso.empresaId) : Promise.resolve(undefined),
      obterPainelRegua(acesso),
      listarPromessas(acesso, { situacao: "todas", faturaId: id }),
    ]);
    const envios = await listarEnviosRegua(acesso.empresaId, [fatura.id]);

    return (
      <>
        <p className="mb-4 text-sm">
          <Link href="/faturas" className="font-medium text-canopy hover:underline">
            Faturas
          </Link>
        </p>
        <CabecalhoPagina
          olho={acesso.nomeEmpresa}
          titulo={`Fatura de ${fatura.nomeCliente}`}
          descricao="Detalhe da cobrança, a régua e as promessas de pagamento desta fatura."
        />
        <TabelaFaturas
          faturas={[fatura]}
          podeCancelar={podeEmitirCobranca(acesso.papel)}
          mostrarCliente
          preferencias={preferencias}
          reguasEnvio={regua.reguas}
          enviosRegua={envios}
          podeEnviarRegua={podeEmitirCobranca(acesso.papel)}
          modoTeste={regua.config.gravada && regua.config.modoTeste}
          emailLogado={acesso.email}
          hoje={hoje}
        />
        <section className="mt-8">
          <h2 className="font-display text-2xl">Promessas desta fatura</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Quem registrou, quando, e se a promessa foi cumprida, cumprida com atraso ou quebrada.
          </p>
          <ListaPromessas promessas={promessas} mostrarCliente={false} />
        </section>
      </>
    );
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.status === 404) notFound();
    throw erro;
  }
}
