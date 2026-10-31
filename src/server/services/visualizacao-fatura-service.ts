import { STATUS_ABERTAS, STATUS_VENCIDAS } from "@/lib/fatura-situacao";
import type { ResultadoVisualizacoesFaturas } from "@/lib/tipos";
import { abrirClienteAsaas } from "@/server/asaas/abrir";
import { type ClienteHttpAsaas, ErroAsaas } from "@/server/asaas/contrato";
import { logAsaas, logAsaasErro, mensagemLogAsaas } from "@/server/asaas/log";
import { instanteMaisAntigo } from "@/server/asaas/visualizacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirAtualizarVisualizacoes } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";

// Abaixo do teto de 50 GETs simultâneos do Asaas. O usuário pediu 3 a 5.
const CONCORRENCIA = 4;
const LOTE_MANUAL = 80;
const LOTE_CRON = 40;
const DIAS_RECENTES = 120;

const ABERTAS_OU_VENCIDAS = [...STATUS_ABERTAS, ...STATUS_VENCIDAS];

export type OpcoesVisualizacao = {
  http?: ClienteHttpAsaas;
  agora?: Date;
  limite?: number;
  concorrencia?: number;
};

export type ResultadoCronVisualizacoes = {
  empresas: number;
  marcadas: number;
  empresasComFalha: number;
};

function filtroPendentes(empresaId: string, agora: Date) {
  const desde = new Date(agora.getTime() - DIAS_RECENTES * 24 * 60 * 60 * 1000);
  return {
    empresaId,
    excluida: false,
    visualizada: false,
    asaasPaymentId: { not: null },
    OR: [
      { status: { in: ABERTAS_OU_VENCIDAS } },
      { status: { not: "CRIANDO" }, criadoEm: { gte: desde } },
    ],
  };
}

function concorrenciaDe(pedido: number | undefined) {
  const valor = pedido ?? CONCORRENCIA;
  return Math.min(5, Math.max(1, valor));
}

export async function sincronizarVisualizacoesEmpresa(
  empresaId: string,
  opcoes: OpcoesVisualizacao = {},
): Promise<ResultadoVisualizacoesFaturas> {
  const { http } = await abrirClienteAsaas(empresaId, opcoes.http);
  const agora = opcoes.agora ?? new Date();
  const limite = opcoes.limite ?? LOTE_MANUAL;
  const concorrencia = concorrenciaDe(opcoes.concorrencia);
  const where = filtroPendentes(empresaId, agora);

  const faturas = await prisma.fatura.findMany({
    where,
    select: { id: true, asaasPaymentId: true },
    orderBy: [{ vencimento: "asc" }, { criadoEm: "asc" }],
    take: limite,
  });

  let consultadas = 0;
  let marcadas = 0;
  let falhas = 0;
  let interrompida = false;
  let naoAutorizado = false;
  let esperaSegundos: number | null = null;
  let parar = false;
  let indice = 0;
  let gravacao: Promise<unknown> = Promise.resolve();

  function gravarEmSerie<T>(acao: () => Promise<T>): Promise<T> {
    const resultado = gravacao.then(acao, acao);
    gravacao = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }

  async function trabalhador() {
    while (!parar) {
      const atual = indice;
      indice += 1;
      const fatura = faturas[atual];
      if (!fatura) return;
      const pagamento = fatura.asaasPaymentId;
      if (!pagamento) continue;

      let quando: Date | null = null;
      try {
        const info = await http.obterVisualizacao(pagamento);
        quando = instanteMaisAntigo([info.faturaEm, info.boletoEm]);
      } catch (erro) {
        if (erro instanceof ErroAsaas && erro.status === 404) {
          consultadas += 1;
          continue;
        }
        if (erro instanceof ErroAsaas && erro.status === 401) {
          parar = true;
          interrompida = true;
          naoAutorizado = true;
          return;
        }
        if (erro instanceof ErroAsaas && erro.status === 429) {
          parar = true;
          interrompida = true;
          esperaSegundos = erro.esperaSegundos;
          return;
        }
        falhas += 1;
        consultadas += 1;
        logAsaasErro("visualizacao_fatura", {
          empresaId,
          pagamento,
          erro: mensagemLogAsaas(erro),
        });
        continue;
      }

      consultadas += 1;
      if (!quando) continue;
      const gravado = await gravarEmSerie(() =>
        prisma.fatura.updateMany({
          where: { id: fatura.id, empresaId, visualizada: false },
          data: { visualizada: true, visualizadaEm: quando },
        }),
      );
      marcadas += gravado.count;
    }
  }

  const trabalhadores = Math.min(concorrencia, faturas.length);
  if (trabalhadores > 0) {
    await Promise.all(Array.from({ length: trabalhadores }, () => trabalhador()));
  }

  if (interrompida) {
    logAsaas("visualizacao_pausa", {
      empresaId,
      marcadas,
      esperaSegundos: esperaSegundos ?? 0,
    });
  }

  if (naoAutorizado && marcadas === 0) {
    throw new ErroAplicacao(
      "O Asaas recusou a chave. Confira se ela é do mesmo ambiente escolhido, sandbox ou produção.",
      400,
      "asaas_nao_autorizado",
    );
  }

  const restantes = await prisma.fatura.count({ where });
  return { marcadas, consultadas, falhas, restantes, interrompida };
}

export async function sincronizarVisualizacoesDoAutor(
  autor: AutorEmpresa,
  opcoes: OpcoesVisualizacao = {},
): Promise<ResultadoVisualizacoesFaturas> {
  exigirAtualizarVisualizacoes(autor);
  return sincronizarVisualizacoesEmpresa(autor.empresaId, opcoes);
}

export async function sincronizarVisualizacoesAgendadas(
  opcoes: OpcoesVisualizacao = {},
): Promise<ResultadoCronVisualizacoes> {
  const empresas = await prisma.configuracaoAsaas.findMany({
    select: { empresaId: true },
    orderBy: { criadoEm: "asc" },
  });
  let marcadas = 0;
  let empresasComFalha = 0;
  for (const empresa of empresas) {
    try {
      const resultado = await sincronizarVisualizacoesEmpresa(empresa.empresaId, {
        ...opcoes,
        limite: opcoes.limite ?? LOTE_CRON,
      });
      marcadas += resultado.marcadas;
    } catch (erro) {
      empresasComFalha += 1;
      logAsaasErro("visualizacao_empresa", {
        empresaId: empresa.empresaId,
        erro: mensagemLogAsaas(erro),
      });
    }
  }
  return { empresas: empresas.length, marcadas, empresasComFalha };
}
