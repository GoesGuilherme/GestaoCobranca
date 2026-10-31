import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeCampo } from "@/components/campo";
import { classeBotaoPrimario } from "@/components/estilos";
import { BotaoAtualizarVisualizacoes } from "@/components/botao-atualizar-visualizacoes";
import { BotaoImportarFaturas } from "@/components/botao-importar-faturas";
import { PainelRecorrenciaLote } from "@/components/painel-recorrencia-lote";
import { AvisoModoTeste } from "@/components/aviso-modo-teste";
import { TabelaFaturas } from "@/components/tabela-faturas";
import { podeAtualizarVisualizacoes, podeEmitirCobranca, podeVerFaturas } from "@/lib/permissoes";
import { FILTROS_VISUALIZACAO, SITUACOES_FATURA, filtroVisualizacao, situacaoFatura } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarFaturas } from "@/server/services/fatura-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";
import { obterPainelRegua } from "@/server/services/regua-service";

export const metadata = { title: "Faturas" };

type Busca = {
  situacao?: string;
  vista?: string;
  busca?: string;
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
  const faturas = await listarFaturas(acesso, { situacao, vista, busca });
  const preferencias = podeEmitirCobranca(acesso.papel) ? await obterPreferenciasCobranca(acesso.empresaId) : undefined;
  const regua = await obterPainelRegua(acesso);

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
        {podeAtualizarVisualizacoes(acesso.papel) ? <BotaoAtualizarVisualizacoes /> : null}
      </div>
      <PainelRecorrenciaLote preferencias={preferencias} />
      <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <select name="situacao" defaultValue={situacao} className={classeCampo}>
            {SITUACOES_FATURA.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Visualização</span>
          <select name="vista" defaultValue={vista} className={classeCampo}>
            {FILTROS_VISUALIZACAO.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-56 flex-1 gap-1 text-sm">
          <span className="font-medium">Cliente</span>
          <input name="busca" defaultValue={busca} placeholder="Nome fantasia ou razão social" className={classeCampo} />
        </label>
        <button type="submit" className={classeBotaoPrimario}>
          Filtrar
        </button>
      </form>
      <TabelaFaturas
        faturas={faturas}
        podeCancelar={podeEmitirCobranca(acesso.papel)}
        mostrarCliente
        preferencias={preferencias}
        reguasEnvio={regua.reguas}
        podeEnviarRegua={podeEmitirCobranca(acesso.papel)}
        modoTeste={regua.config.gravada && regua.config.modoTeste}
        emailLogado={acesso.email}
      />
      <p className="mt-4 text-sm text-muted">
        Para emitir uma cobrança nova, abra o cliente em <Link href="/clientes" className="text-canopy hover:underline">Clientes</Link>.
      </p>
    </>
  );
}
