import { dataIsoValida } from "@/lib/data";
import { compararDinheiro, normalizarDinheiro, somarDinheiro } from "@/lib/dinheiro";
import { diferencaDias } from "@/lib/regua";
import { FORMAS_COBRANCA, STATUS_CLIENTE } from "@/lib/rotulos";
import type { FormaCobranca, StatusCliente } from "@/lib/tipos";

export const STATUS_RECEBIDO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] as const;
export const STATUS_ATRASO = ["OVERDUE", "DUNNING_REQUESTED"] as const;
export const STATUS_ABERTO = ["PENDING", "AWAITING_RISK_ANALYSIS"] as const;
export const STATUS_ESTORNO = [
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
] as const;

export const PERIODOS_PAINEL = [
  { valor: "este_mes", rotulo: "Este mês" },
  { valor: "mes_passado", rotulo: "Mês passado" },
  { valor: "ultimos_3", rotulo: "Últimos 3 meses" },
  { valor: "ultimos_12", rotulo: "Últimos 12 meses" },
] as const;

export type PeriodoPainel = (typeof PERIODOS_PAINEL)[number]["valor"];
export type ClasseFinanceira = "recebido" | "atraso" | "a_receber" | "fora";

export type FiltrosPainel = {
  periodo: PeriodoPainel;
  forma: FormaCobranca | null;
  statusCliente: StatusCliente | null;
};

export type FaturaPainel = {
  id: string;
  status: string;
  excluida: boolean;
  valor: string;
  vencimento: string;
  atualizadoEm: string;
  formaCobranca: string;
  clienteServicoId: string | null;
  clienteId: string;
  clienteNome: string;
};

export type AssinaturaPainel = {
  id: string;
  valor: string;
  diaVencimento: number | null;
  proximoVencimento: string | null;
  mesesComFatura: readonly string[];
};

export type MesFinanceiro = {
  mes: string;
  rotulo: string;
  recebido: string;
  atraso: string;
  aReceber: string;
  previsao: string;
  inadimplencia: string | null;
};

export type PainelFinanceiro = {
  periodo: { chave: PeriodoPainel; inicio: string; fim: string; rotulo: string };
  rotuloRecebido: string;
  rotuloAReceber: string;
  emAtraso: { valor: string; quantidade: number; diasMaisAntigo: number | null };
  recebido: { valor: string };
  aReceber: { valor: string };
  previstoProximoMes: { emitido: string; previsao: string; total: string; mes: string; rotulo: string };
  inadimplencia: string | null;
  meses: MesFinanceiro[];
  topAtraso: { clienteId: string; nome: string; valor: string; dias: number }[];
  proximos: { id: string; clienteId: string; nome: string; valor: string; vencimento: string; forma: string }[];
};

const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const LIMITE_TOP = 8;
const LIMITE_PROXIMOS = 12;

function inclui(lista: readonly string[], status: string): boolean {
  return lista.some((item) => item === status);
}

function centavos(texto: string): bigint | null {
  const normal = normalizarDinheiro(texto);
  if (!normal) return null;
  const [inteiro, frac] = normal.split(".");
  return BigInt(inteiro) * BigInt(100) + BigInt(frac);
}

function dentro(iso: string, inicio: string, fim: string): boolean {
  return iso >= inicio && iso <= fim;
}

export function classificarFaturaFinanceira(fatura: {
  status: string;
  excluida: boolean;
  vencimento: string;
  hoje: string;
}): ClasseFinanceira {
  if (fatura.excluida || inclui(STATUS_ESTORNO, fatura.status)) return "fora";
  if (inclui(STATUS_RECEBIDO, fatura.status)) return "recebido";
  if (inclui(STATUS_ATRASO, fatura.status)) return "atraso";
  if (inclui(STATUS_ABERTO, fatura.status)) {
    return fatura.vencimento < fatura.hoje ? "atraso" : "a_receber";
  }
  return "fora";
}

// Uma casa, truncada. Total zero não tem taxa: o chamador mostra um traço.
export function taxaInadimplencia(parte: string, total: string): string | null {
  const numerador = centavos(parte);
  const divisor = centavos(total);
  if (numerador === null || divisor === null || divisor === BigInt(0)) return null;
  const decimos = (numerador * BigInt(1000)) / divisor;
  const inteiro = decimos / BigInt(10);
  const frac = decimos % BigInt(10);
  return `${inteiro}.${frac}`;
}

export function formatarTaxa(taxa: string | null): string {
  if (taxa === null) return "—";
  const [inteiro, frac] = taxa.split(".");
  return `${inteiro},${frac ?? "0"}%`;
}

export function somarMeses(mes: string, delta: number): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const total = ano * 12 + (numero - 1) + delta;
  const anoNovo = Math.floor(total / 12);
  const mesNovo = (total % 12) + 1;
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}`;
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function fimDoMes(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  return `${mes}-${String(ultimoDia(ano, numero)).padStart(2, "0")}`;
}

export function rotuloMesCurto(mes: string): string {
  const numero = Number(mes.slice(5, 7));
  const nome = MESES_CURTO[numero - 1] ?? mes;
  return `${nome}/${mes.slice(2, 4)}`;
}

export function rotuloMesLongo(mes: string): string {
  const numero = Number(mes.slice(5, 7));
  const nome = MESES_LONGO[numero - 1] ?? mes;
  return `${nome} de ${mes.slice(0, 4)}`;
}

export function mesesDoGrafico(hoje: string): string[] {
  const atual = hoje.slice(0, 7);
  const inicio = somarMeses(atual, -11);
  const meses: string[] = [];
  for (let indice = 0; indice < 15; indice += 1) meses.push(somarMeses(inicio, indice));
  return meses;
}

export function intervaloPeriodo(periodo: PeriodoPainel, hoje: string): { inicio: string; fim: string; rotulo: string } {
  const atual = hoje.slice(0, 7);
  const fim = fimDoMes(atual);
  const item = PERIODOS_PAINEL.find((opcao) => opcao.valor === periodo);
  if (periodo === "mes_passado") {
    const alvo = somarMeses(atual, -1);
    return { inicio: `${alvo}-01`, fim: fimDoMes(alvo), rotulo: item?.rotulo ?? "Mês passado" };
  }
  if (periodo === "ultimos_3" || periodo === "ultimos_12") {
    const alvo = somarMeses(atual, periodo === "ultimos_3" ? -2 : -11);
    return { inicio: `${alvo}-01`, fim, rotulo: item?.rotulo ?? periodo };
  }
  return { inicio: `${atual}-01`, fim, rotulo: item?.rotulo ?? "Este mês" };
}

export function lerFiltrosPainel(params: { periodo?: string; forma?: string; status?: string }): FiltrosPainel {
  const periodo = PERIODOS_PAINEL.some((item) => item.valor === params.periodo)
    ? (params.periodo as PeriodoPainel)
    : "este_mes";
  const forma = FORMAS_COBRANCA.some((item) => item.valor === params.forma) ? (params.forma as FormaCobranca) : null;
  const statusCliente = STATUS_CLIENTE.some((item) => item.valor === params.status)
    ? (params.status as StatusCliente)
    : null;
  return { periodo, forma, statusCliente };
}

// O dia da assinatura naquele mês. Não inventa data se não houver dia nem próximo vencimento.
// Mês anterior ao próximo vencimento fica de fora. Se o próximo vencimento ainda cabe no mês, ele vale.
export function dataProjetada(assinatura: AssinaturaPainel, mes: string, hoje: string): string | null {
  const proximo = assinatura.proximoVencimento;
  const dia = assinatura.diaVencimento ?? (proximo && dataIsoValida(proximo) ? Number(proximo.slice(8, 10)) : null);
  if (dia === null || !Number.isInteger(dia) || dia < 1 || dia > 31) return null;
  if (assinatura.mesesComFatura.some((item) => item === mes)) return null;
  if (proximo && dataIsoValida(proximo) && mes < proximo.slice(0, 7)) return null;
  if (proximo && dataIsoValida(proximo) && proximo.slice(0, 7) === mes && proximo >= hoje) return proximo;
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const iso = `${mes}-${String(Math.min(dia, ultimoDia(ano, numero))).padStart(2, "0")}`;
  if (!dataIsoValida(iso) || iso < hoje) return null;
  return iso;
}

function somarValores(valores: string[]): string {
  return somarDinheiro(valores.length > 0 ? valores : ["0.00"]);
}

function diasDeAtraso(vencimento: string, hoje: string): number {
  const dias = diferencaDias(vencimento, hoje);
  return dias > 0 ? dias : 0;
}

export function montarPainelFinanceiro(entrada: {
  faturas: FaturaPainel[];
  assinaturas: AssinaturaPainel[];
  periodo: PeriodoPainel;
  hoje: string;
}): PainelFinanceiro {
  const periodo = intervaloPeriodo(entrada.periodo, entrada.hoje);
  const meses = mesesDoGrafico(entrada.hoje);
  const mesProximo = somarMeses(entrada.hoje.slice(0, 7), 1);
  const limiteProximos = somarDiasSeguro(entrada.hoje, 30);
  const classificadas = entrada.faturas.map((fatura) => ({
    fatura,
    classe: classificarFaturaFinanceira({ ...fatura, hoje: entrada.hoje }),
  }));

  const porMes = new Map<string, { recebido: string[]; atraso: string[]; aReceber: string[] }>();
  for (const mes of meses) porMes.set(mes, { recebido: [], atraso: [], aReceber: [] });

  const atrasoPeriodo: { fatura: FaturaPainel; dias: number }[] = [];
  const receberPeriodo: string[] = [];
  const faturadoPeriodo: string[] = [];
  const recebidoPeriodo: string[] = [];
  const emitidoProximo: string[] = [];
  const proximos: PainelFinanceiro["proximos"] = [];

  for (const item of classificadas) {
    if (item.classe === "fora") continue;
    const { fatura } = item;
    const mes = fatura.vencimento.slice(0, 7);
    const balde = porMes.get(mes);
    if (balde && item.classe === "recebido") balde.recebido.push(fatura.valor);
    if (balde && item.classe === "atraso") balde.atraso.push(fatura.valor);
    if (balde && item.classe === "a_receber") balde.aReceber.push(fatura.valor);

    const noPeriodo = dentro(fatura.vencimento, periodo.inicio, periodo.fim);
    if (noPeriodo) faturadoPeriodo.push(fatura.valor);
    if (item.classe === "atraso" && noPeriodo) {
      atrasoPeriodo.push({ fatura, dias: diasDeAtraso(fatura.vencimento, entrada.hoje) });
    }
    if (item.classe === "a_receber" && noPeriodo) receberPeriodo.push(fatura.valor);
    if (item.classe === "recebido" && dentro(fatura.atualizadoEm, periodo.inicio, periodo.fim)) {
      recebidoPeriodo.push(fatura.valor);
    }
    if ((item.classe === "atraso" || item.classe === "a_receber") && mes === mesProximo) {
      emitidoProximo.push(fatura.valor);
    }
    if (
      item.classe === "a_receber" &&
      fatura.vencimento >= entrada.hoje &&
      fatura.vencimento <= limiteProximos
    ) {
      proximos.push({
        id: fatura.id,
        clienteId: fatura.clienteId,
        nome: fatura.clienteNome,
        valor: fatura.valor,
        vencimento: fatura.vencimento,
        forma: fatura.formaCobranca,
      });
    }
  }

  const previsaoPorMes = new Map<string, string[]>();
  for (const mes of meses) {
    const valores = entrada.assinaturas
      .filter((assinatura) => dataProjetada(assinatura, mes, entrada.hoje))
      .map((assinatura) => assinatura.valor);
    previsaoPorMes.set(mes, valores);
  }

  const valorAtraso = somarValores(atrasoPeriodo.map((item) => item.fatura.valor));
  const diasMaisAntigo = atrasoPeriodo.reduce<number | null>(
    (maior, item) => (maior === null || item.dias > maior ? item.dias : maior),
    null,
  );

  const grupos = new Map<string, { clienteId: string; nome: string; valores: string[]; dias: number }>();
  for (const item of atrasoPeriodo) {
    const grupo = grupos.get(item.fatura.clienteId) ?? {
      clienteId: item.fatura.clienteId,
      nome: item.fatura.clienteNome,
      valores: [],
      dias: 0,
    };
    grupo.valores.push(item.fatura.valor);
    if (item.dias > grupo.dias) grupo.dias = item.dias;
    grupos.set(item.fatura.clienteId, grupo);
  }

  const topAtraso = [...grupos.values()]
    .map((grupo) => ({
      clienteId: grupo.clienteId,
      nome: grupo.nome,
      valor: somarValores(grupo.valores),
      dias: grupo.dias,
    }))
    .sort((a, b) => {
      const valor = compararDinheiro(b.valor, a.valor);
      if (valor !== 0) return valor;
      if (b.dias !== a.dias) return b.dias - a.dias;
      return a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, LIMITE_TOP);

  proximos.sort((a, b) => {
    if (a.vencimento !== b.vencimento) return a.vencimento < b.vencimento ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const esteMes = entrada.periodo === "este_mes";
  const previsaoProximo = previsaoPorMes.get(mesProximo) ?? [];

  return {
    periodo: { chave: entrada.periodo, ...periodo },
    rotuloRecebido: esteMes ? "Recebido no mês" : "Recebido no período",
    rotuloAReceber: esteMes ? "A receber no mês" : "A receber no período",
    emAtraso: { valor: valorAtraso, quantidade: atrasoPeriodo.length, diasMaisAntigo },
    recebido: { valor: somarValores(recebidoPeriodo) },
    aReceber: { valor: somarValores(receberPeriodo) },
    previstoProximoMes: {
      emitido: somarValores(emitidoProximo),
      previsao: somarValores(previsaoProximo),
      total: somarValores([...emitidoProximo, ...previsaoProximo]),
      mes: mesProximo,
      rotulo: rotuloMesLongo(mesProximo),
    },
    inadimplencia: taxaInadimplencia(valorAtraso, somarValores(faturadoPeriodo)),
    meses: meses.map((mes) => {
      const balde = porMes.get(mes) ?? { recebido: [], atraso: [], aReceber: [] };
      const recebido = somarValores(balde.recebido);
      const atraso = somarValores(balde.atraso);
      const aReceber = somarValores(balde.aReceber);
      return {
        mes,
        rotulo: rotuloMesCurto(mes),
        recebido,
        atraso,
        aReceber,
        previsao: somarValores(previsaoPorMes.get(mes) ?? []),
        inadimplencia: taxaInadimplencia(atraso, somarValores([...balde.recebido, ...balde.atraso, ...balde.aReceber])),
      };
    }),
    topAtraso,
    proximos: proximos.slice(0, LIMITE_PROXIMOS),
  };
}

function somarDiasSeguro(iso: string, dias: number): string {
  const data = new Date(`${iso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
