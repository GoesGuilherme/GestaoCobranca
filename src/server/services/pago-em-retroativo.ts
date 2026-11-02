import { dataIsoValida } from "@/lib/data";
import { STATUS_PAGAS } from "@/lib/fatura-situacao";
import { type ClienteHttpAsaas, type CobrancaAsaas, ErroAsaas } from "@/server/asaas/contrato";
import { abrirClienteAsaas } from "@/server/asaas/abrir";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";

/** O Asaas devolve no máximo 100 cobranças por chamada. */
export const LOTE_COBRANCAS = 100;
/** Folga entre páginas para ficar abaixo do limite de taxa do Asaas. */
export const PAUSA_ENTRE_PAGINAS_MS = 700;
/** Teto de páginas por status numa execução. O que faltar entra na próxima, porque pago_em nulo continua pendente. */
export const MAX_PAGINAS_POR_STATUS = 5;

const STATUS = [...STATUS_PAGAS];

export type ResultadoPagoEm = {
  empresaId: string;
  candidatas: number;
  consultas: number;
  preenchidas: number;
  semData: number;
  restantes: number;
  interrompida: boolean;
  esperaSegundos: number | null;
  semConfiguracao: boolean;
};

export type OpcoesPagoEm = {
  http?: Pick<ClienteHttpAsaas, "listarCobrancas">;
  pausaMs?: number;
  maxPaginas?: number;
  pausar?: (ms: number) => Promise<void>;
};

function ondePendente(empresaId: string) {
  return {
    empresaId,
    excluida: false,
    pagoEm: null,
    asaasPaymentId: { not: null },
    status: { in: STATUS },
  };
}

export async function contarFaturasSemPagoEm(empresaId: string): Promise<number> {
  return prisma.fatura.count({ where: ondePendente(empresaId) });
}

function vazio(empresaId: string, candidatas: number, semConfiguracao = false): ResultadoPagoEm {
  return {
    empresaId,
    candidatas,
    consultas: 0,
    preenchidas: 0,
    semData: 0,
    restantes: candidatas,
    interrompida: false,
    esperaSegundos: null,
    semConfiguracao,
  };
}

async function pausaPadrao(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca a data real no Asaas e grava só onde pago_em ainda é nulo.
 * Uma segunda execução não reescreve data já gravada e nem chama o Asaas se não houver pendência.
 */
export async function preencherPagoEmDaEmpresa(
  empresaId: string,
  opcoes: OpcoesPagoEm = {},
): Promise<ResultadoPagoEm> {
  const candidatas = await contarFaturasSemPagoEm(empresaId);
  if (candidatas === 0) return vazio(empresaId, 0);

  const pendentes = new Set(
    (
      await prisma.fatura.findMany({
        where: ondePendente(empresaId),
        select: { asaasPaymentId: true },
      })
    )
      .map((fatura) => fatura.asaasPaymentId)
      .filter((id): id is string => Boolean(id)),
  );

  let http: Pick<ClienteHttpAsaas, "listarCobrancas">;
  try {
    http = opcoes.http ?? (await abrirClienteAsaas(empresaId)).http;
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.codigo === "asaas_nao_configurado") {
      return vazio(empresaId, candidatas, true);
    }
    throw erro;
  }

  const pausaMs = opcoes.pausaMs ?? PAUSA_ENTRE_PAGINAS_MS;
  const maxPaginas = opcoes.maxPaginas ?? MAX_PAGINAS_POR_STATUS;
  const pausar = opcoes.pausar ?? pausaPadrao;
  let consultas = 0;
  let preenchidas = 0;
  let semData = 0;
  let interrompida = false;
  let esperaSegundos: number | null = null;
  let primeiraConsulta = true;

  for (const status of STATUS) {
    if (pendentes.size === 0 || interrompida) break;
    let offset = 0;
    for (let pagina = 0; pagina < maxPaginas && pendentes.size > 0; pagina += 1) {
      if (!primeiraConsulta) await pausar(pausaMs);
      primeiraConsulta = false;
      let lote;
      try {
        lote = await http.listarCobrancas({ status, offset, limit: LOTE_COBRANCAS });
      } catch (erro) {
        if (erro instanceof ErroAsaas && (erro.status === 429 || erro.status === 401)) {
          interrompida = true;
          esperaSegundos = erro.status === 429 ? erro.esperaSegundos : null;
          break;
        }
        throw erro;
      }
      consultas += 1;
      await aplicarPagina(empresaId, pendentes, lote.cobrancas, (gravadas, sem) => {
        preenchidas += gravadas;
        semData += sem;
      });
      if (!lote.temMais || lote.cobrancas.length === 0) break;
      offset += lote.cobrancas.length;
    }
  }

  const restantes = await contarFaturasSemPagoEm(empresaId);
  return {
    empresaId,
    candidatas,
    consultas,
    preenchidas,
    semData,
    restantes,
    interrompida,
    esperaSegundos,
    semConfiguracao: false,
  };
}

async function aplicarPagina(
  empresaId: string,
  pendentes: Set<string>,
  cobrancas: CobrancaAsaas[],
  somar: (gravadas: number, semData: number) => void,
) {
  for (const cobranca of cobrancas) {
    if (!pendentes.has(cobranca.id)) continue;
    if (cobranca.excluida || !cobranca.pagoEm || !dataIsoValida(cobranca.pagoEm)) {
      pendentes.delete(cobranca.id);
      somar(0, 1);
      continue;
    }
    const gravado = await prisma.fatura.updateMany({
      where: {
        empresaId,
        asaasPaymentId: cobranca.id,
        pagoEm: null,
        excluida: false,
        status: { in: STATUS },
      },
      data: { pagoEm: new Date(`${cobranca.pagoEm}T00:00:00.000Z`) },
    });
    pendentes.delete(cobranca.id);
    somar(gravado.count, 0);
  }
}

export async function empresasComAsaas(): Promise<string[]> {
  const configs = await prisma.configuracaoAsaas.findMany({
    select: { empresaId: true },
    orderBy: { criadoEm: "asc" },
  });
  return configs.map((config) => config.empresaId);
}
