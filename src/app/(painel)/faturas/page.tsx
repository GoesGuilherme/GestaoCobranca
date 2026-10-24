import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeCampo } from "@/components/campo";
import { classeBotaoPrimario } from "@/components/estilos";
import { BotaoImportarFaturas } from "@/components/botao-importar-faturas";
import { PainelRecorrenciaLote } from "@/components/painel-recorrencia-lote";
import { TabelaFaturas } from "@/components/tabela-faturas";
import { podeEmitirCobranca, podeVerFaturas } from "@/lib/permissoes";
import { SITUACOES_FATURA, situacaoFatura } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarFaturas } from "@/server/services/fatura-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export const metadata = { title: "Faturas" };

type Busca = {
  situacao?: string;
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
  const busca = params.busca?.trim() ?? "";
  const faturas = await listarFaturas(acesso, { situacao, busca });
  const preferencias = podeEmitirCobranca(acesso.papel) ? await obterPreferenciasCobranca(acesso.empresaId) : undefined;

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo={situacao === "em_aberto" ? "Faturas em aberto" : "Faturas"}
        descricao="Cobranças espelhadas do Asaas. A emissão avulsa fica na ficha do cliente. A recorrência mensal também sai de lá, ou em lote abaixo."
      />
      <BotaoImportarFaturas />
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
        <label className="grid min-w-56 flex-1 gap-1 text-sm">
          <span className="font-medium">Cliente</span>
          <input name="busca" defaultValue={busca} placeholder="Nome fantasia ou razão social" className={classeCampo} />
        </label>
        <button type="submit" className={classeBotaoPrimario}>
          Filtrar
        </button>
      </form>
      <TabelaFaturas faturas={faturas} podeCancelar={podeEmitirCobranca(acesso.papel)} mostrarCliente />
      <p className="mt-4 text-sm text-muted">
        Para emitir uma cobrança nova, abra o cliente em <Link href="/clientes" className="text-canopy hover:underline">Clientes</Link>.
      </p>
    </>
  );
}
