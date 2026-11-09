import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeCampo } from "@/components/campo";
import { classeBotaoPrimario } from "@/components/estilos";
import { BotaoAtualizarAsaas } from "@/components/botao-atualizar-asaas";
import { BotaoImportarFaturas } from "@/components/botao-importar-faturas";
import { PainelRecorrenciaLote } from "@/components/painel-recorrencia-lote";
import { AvisoModoTeste } from "@/components/aviso-modo-teste";
import { FaturasComControles } from "@/components/faturas-com-controles";
import { FiltroPeriodoFaturas } from "@/components/filtro-periodo-faturas";
import { LegendaFaturas } from "@/components/legenda-faturas";
import { EstadoVazio } from "@/components/estado-vazio";
import { dataHojeIso } from "@/lib/data";
import { consultaPeriodo, faixaDoPeriodo, lerFiltroPeriodo, rotuloFaixaPeriodo, textoListaFaturas } from "@/lib/periodo-faturas";
import { podeAtualizarVisualizacoes, podeEmitirCobranca, podeVerFaturas } from "@/lib/permissoes";
import { FILTROS_VISUALIZACAO, SITUACOES_FATURA, filtroVisualizacao, situacaoFatura } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { classificarPagadoresDaEmpresa } from "@/server/services/classificacao-pagador-service";
import { listarFaturas } from "@/server/services/fatura-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";
import { listarEnviosRegua } from "@/server/services/regua-envios";
import { obterPainelRegua } from "@/server/services/regua-service";

export const metadata = { title: "Faturas" };

type Busca = {
  situacao?: string;
  vista?: string;
  busca?: string;
  periodo?: string;
  por?: string;
  de?: string;
  ate?: string;
};

export default async function PaginaFaturas({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Faturas ficam com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver as faturas."
      />
    );
  }
  const situacao = situacaoFatura(params.situacao);
  const vista = filtroVisualizacao(params.vista);
  const busca = params.busca?.trim() ?? "";
  const filtroPeriodo = lerFiltroPeriodo(params);
  const hoje = dataHojeIso();
  const faixa = faixaDoPeriodo(filtroPeriodo, hoje);
  const [faturas, preferencias, regua] = await Promise.all([
    listarFaturas(acesso, { situacao, vista, busca, periodo: consultaPeriodo(filtroPeriodo, hoje) }),
    podeEmitirCobranca(acesso.papel) ? obterPreferenciasCobranca(acesso.empresaId) : Promise.resolve(undefined),
    obterPainelRegua(acesso),
  ]);
  const [enviosRegua, selos] = await Promise.all([
    listarEnviosRegua(
      acesso.empresaId,
      faturas.map((fatura) => fatura.id),
    ),
    classificarPagadoresDaEmpresa(
      acesso.empresaId,
      faturas.map((fatura) => fatura.clienteId),
      hoje,
    ),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo={situacao === "em_aberto" ? "Faturas em aberto" : "Faturas"}
        descricao="Cobranças espelhadas do Asaas. A emissão avulsa fica na ficha do cliente. A recorrência mensal também sai de lá, ou em lote abaixo."
      />
      <AvisoModoTeste ativo={regua.config.gravada && regua.config.modoTeste} />
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <BotaoImportarFaturas />
        {podeAtualizarVisualizacoes(acesso.papel) ? <BotaoAtualizarAsaas /> : null}
      </div>
      <PainelRecorrenciaLote preferencias={preferencias} />
      <LegendaFaturas />
      <form className="mb-6 flex flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end" method="get">
        <label className="grid w-full gap-1 text-sm sm:w-auto">
          <span className="font-medium">Situação</span>
          <select name="situacao" defaultValue={situacao} className={classeCampo}>
            {SITUACOES_FATURA.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid w-full gap-1 text-sm sm:w-auto">
          <span className="font-medium">Visualização</span>
          <select name="vista" defaultValue={vista} className={classeCampo}>
            {FILTROS_VISUALIZACAO.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid w-full gap-1 text-sm sm:min-w-56 sm:flex-1">
          <span className="font-medium">Cliente</span>
          <input name="busca" defaultValue={busca} placeholder="Nome fantasia ou razão social" className={classeCampo} />
        </label>
        <FiltroPeriodoFaturas filtro={filtroPeriodo} />
        <button type="submit" className={`${classeBotaoPrimario} w-full sm:w-auto`}>
          Filtrar
        </button>
      </form>
      {faixa ? <p className="mb-3 text-sm text-muted">{rotuloFaixaPeriodo(filtroPeriodo.campo, faixa)}</p> : null}
      {faturas.length === 0 ? (
        <>
          <p className="mb-3 text-sm text-muted">{textoListaFaturas(0)}</p>
          {podeEmitirCobranca(acesso.papel) ? (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button type="button" className={classeBotaoPrimario} disabled>
                Reenviar boletos
              </button>
              <span className="text-sm text-muted">Nenhum boleto nesta lista.</span>
            </div>
          ) : null}
          <EstadoVazio
            titulo={busca ? "Nenhuma fatura encontrada" : faixa ? "Nenhuma fatura neste período" : "Nenhuma fatura nesta situação"}
            descricao={
              busca
                ? "Tente o nome fantasia ou a razão social, ou limpe a busca."
                : faixa
                  ? "Troque o período ou a data, ou escolha Todos."
                  : "A emissão avulsa fica na ficha do cliente. A recorrência mensal pode ser ativada em lote acima."
            }
          />
        </>
      ) : (
        <FaturasComControles
          faturas={faturas}
          podeCancelar={podeEmitirCobranca(acesso.papel)}
          mostrarCliente
          preferencias={preferencias}
          reguasEnvio={regua.reguas}
          enviosRegua={enviosRegua}
          podeEnviarRegua={podeEmitirCobranca(acesso.papel)}
          modoTeste={regua.config.gravada && regua.config.modoTeste}
          emailLogado={acesso.email}
          hoje={hoje}
          selos={Object.fromEntries(selos)}
        />
      )}
      <p className="mt-4 text-sm text-muted">
        Para emitir uma cobrança nova, abra o cliente em <Link href="/clientes" className="text-canopy hover:underline">Clientes</Link>.
      </p>
    </>
  );
}
