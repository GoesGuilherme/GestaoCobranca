import { dataIsoValida, isoDeData } from "@/lib/data";
import { formatarDataIso } from "@/lib/formatacao";

export const PERIODOS_FATURA = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "mes_atual", rotulo: "Mês atual" },
  { valor: "mes_anterior", rotulo: "Mês anterior" },
  { valor: "proximo_mes", rotulo: "Próximo mês" },
  { valor: "ultimos_30", rotulo: "Últimos 30 dias" },
  { valor: "personalizado", rotulo: "Personalizado" },
] as const;

export const CAMPOS_PERIODO_FATURA = [
  { valor: "vencimento", rotulo: "Vencimento" },
  { valor: "pagamento", rotulo: "Pagamento" },
] as const;

export type PeriodoFatura = (typeof PERIODOS_FATURA)[number]["valor"];
export type CampoPeriodoFatura = (typeof CAMPOS_PERIODO_FATURA)[number]["valor"];

export type FiltroPeriodoFatura = {
  periodo: PeriodoFatura;
  campo: CampoPeriodoFatura;
  de: string;
  ate: string;
};

export type FaixaPeriodoFatura = {
  inicio: string | null;
  fim: string | null;
};

export type ConsultaPeriodoFatura = {
  campo: CampoPeriodoFatura;
  inicio: string | null;
  fim: string | null;
};

function somarMeses(mes: string, delta: number): string {
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

function somarDias(iso: string, dias: number): string {
  const data = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  data.setUTCDate(data.getUTCDate() + dias);
  return isoDeData(data);
}

function dataOuVazio(valor: string | undefined): string {
  const texto = valor?.trim() ?? "";
  return dataIsoValida(texto) ? texto : "";
}

export function lerFiltroPeriodo(params: {
  periodo?: string;
  por?: string;
  de?: string;
  ate?: string;
}): FiltroPeriodoFatura {
  const bruto = params.periodo?.trim() ?? "";
  const periodo = PERIODOS_FATURA.some((item) => item.valor === bruto) ? (bruto as PeriodoFatura) : "todos";
  const campo = params.por?.trim() === "pagamento" ? "pagamento" : "vencimento";
  return { periodo, campo, de: dataOuVazio(params.de), ate: dataOuVazio(params.ate) };
}

// Todos devolve null: a lista continua sem corte de data.
// Últimos 30 dias inclui o dia de hoje e os 29 anteriores.
export function faixaDoPeriodo(filtro: FiltroPeriodoFatura, hoje: string): FaixaPeriodoFatura | null {
  if (!dataIsoValida(hoje) || filtro.periodo === "todos") return null;
  if (filtro.periodo === "personalizado") {
    let inicio = filtro.de || null;
    let fim = filtro.ate || null;
    if (inicio && fim && inicio > fim) {
      const troca = inicio;
      inicio = fim;
      fim = troca;
    }
    if (!inicio && !fim) return null;
    return { inicio, fim };
  }
  if (filtro.periodo === "ultimos_30") {
    return { inicio: somarDias(hoje, -29), fim: hoje };
  }
  const mes = hoje.slice(0, 7);
  const alvo =
    filtro.periodo === "mes_anterior" ? somarMeses(mes, -1) : filtro.periodo === "proximo_mes" ? somarMeses(mes, 1) : mes;
  return { inicio: `${alvo}-01`, fim: fimDoMes(alvo) };
}

export function consultaPeriodo(filtro: FiltroPeriodoFatura, hoje: string): ConsultaPeriodoFatura | undefined {
  const faixa = faixaDoPeriodo(filtro, hoje);
  if (!faixa) return undefined;
  return { campo: filtro.campo, inicio: faixa.inicio, fim: faixa.fim };
}

export function rotuloFaixaPeriodo(campo: CampoPeriodoFatura, faixa: FaixaPeriodoFatura): string {
  const nome = campo === "pagamento" ? "Pagamento" : "Vencimento";
  if (faixa.inicio && faixa.fim) return `${nome} de ${formatarDataIso(faixa.inicio)} a ${formatarDataIso(faixa.fim)}.`;
  if (faixa.inicio) return `${nome} a partir de ${formatarDataIso(faixa.inicio)}.`;
  return `${nome} até ${formatarDataIso(faixa.fim ?? "")}.`;
}

export function textoListaFaturas(total: number): string {
  return total === 1 ? "1 fatura nesta lista" : `${total} faturas nesta lista`;
}
