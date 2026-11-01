import { formatarDataIso } from "@/lib/formatacao";
import { normalizarDinheiro } from "@/lib/dinheiro";
import {
  rotuloMesCurto,
  somarMeses,
  taxaInadimplencia,
  type FiltrosPainel,
} from "@/lib/painel-financeiro";

export const HORIZONTES_BOCA = [6, 12] as const;
export type HorizonteBoca = (typeof HORIZONTES_BOCA)[number];

export type SituacaoMesBoca = "fechado" | "parcial" | "futuro";

// Totais já agregados de um mês. O serviço soma no banco; aqui só completa
// os meses vazios e a taxa. Canceladas, estornadas e CRIANDO não entram.
export type LinhaBoca = {
  mes: string;
  faturado: string;
  recebido: string;
  inadimplente: string;
  aVencer: string;
};

export type PontoBoca = {
  mes: string;
  rotulo: string;
  rotuloEixo: string;
  situacao: SituacaoMesBoca;
  faturado: string;
  recebido: string;
  inadimplente: string;
  aVencer: string;
  outros: string;
  taxa: string | null;
  nota: string | null;
  faturadoNum: number;
  recebidoNum: number;
  inadimplenteNum: number;
  aVencerNum: number;
  outrosNum: number;
};

export type ResumoBoca = {
  inadimplente: string;
  base: string;
  taxa: string | null;
  foraDoGrafico: boolean;
};

export type BocaJacare = {
  horizonte: HorizonteBoca;
  hoje: string;
  meses: PontoBoca[];
  resumo: ResumoBoca;
  vazio: boolean;
};

export function lerHorizonteBoca(valor: string | undefined): HorizonteBoca {
  return valor === "6" ? 6 : 12;
}

export function hrefBocaJacare(filtros: FiltrosPainel, horizonte: HorizonteBoca): string {
  const busca = new URLSearchParams();
  if (filtros.periodo !== "este_mes") busca.set("periodo", filtros.periodo);
  if (filtros.forma) busca.set("forma", filtros.forma);
  if (filtros.statusCliente) busca.set("status", filtros.statusCliente);
  busca.set("boca", String(horizonte));
  return `/dashboards/financeiro?${busca.toString()}`;
}

export function mesesDoHorizonte(hoje: string, horizonte: HorizonteBoca): string[] {
  const atual = hoje.slice(0, 7);
  const inicio = somarMeses(atual, -(horizonte - 1));
  const meses: string[] = [];
  for (let indice = 0; indice < horizonte; indice += 1) {
    meses.push(somarMeses(inicio, indice));
  }
  return meses;
}

// Mês corrente continua parcial até virar o calendário: o que vence hoje
// ainda não é inadimplência. Mês futuro só entra se o recorte passar de hoje.
export function situacaoDoMes(mes: string, hoje: string): SituacaoMesBoca {
  const atual = hoje.slice(0, 7);
  if (mes > atual) return "futuro";
  if (mes < atual) return "fechado";
  return "parcial";
}

export function textoSituacao(situacao: SituacaoMesBoca, hoje: string): string | null {
  if (situacao === "parcial") {
    return `Mês em andamento. A inadimplência deste mês é só o que venceu antes de ${formatarDataIso(hoje)}. Fatura que vence hoje ou depois fica como ainda não vencida.`;
  }
  if (situacao === "futuro") {
    return "Mês futuro. A inadimplência deste mês só inclui cobrança já marcada como vencida. O restante ainda não venceu.";
  }
  return null;
}

function centavosDe(texto: string): bigint {
  const normal = normalizarDinheiro(texto) ?? "0.00";
  const [inteiro, frac] = normal.split(".");
  return BigInt(inteiro) * BigInt(100) + BigInt(frac);
}

function textoDe(centavos: bigint): string {
  const absoluto = centavos < BigInt(0) ? -centavos : centavos;
  const inteiro = absoluto / BigInt(100);
  const frac = (absoluto % BigInt(100)).toString().padStart(2, "0");
  return `${inteiro}.${frac}`;
}

function reaisDe(centavos: bigint): number {
  return Number(centavos) / 100;
}

function dinheiro(texto: string): string {
  return textoDe(centavosDe(texto));
}

export function montarBocaJacare(entrada: {
  linhas: LinhaBoca[];
  horizonte: HorizonteBoca;
  hoje: string;
  resumo: { inadimplente: string; base: string };
}): BocaJacare {
  const porMes = new Map<string, { faturado: bigint; recebido: bigint; inadimplente: bigint; aVencer: bigint }>();
  for (const linha of entrada.linhas) {
    if (!/^\d{4}-\d{2}$/.test(linha.mes)) continue;
    const atual = porMes.get(linha.mes) ?? {
      faturado: BigInt(0),
      recebido: BigInt(0),
      inadimplente: BigInt(0),
      aVencer: BigInt(0),
    };
    atual.faturado += centavosDe(linha.faturado);
    atual.recebido += centavosDe(linha.recebido);
    atual.inadimplente += centavosDe(linha.inadimplente);
    atual.aVencer += centavosDe(linha.aVencer);
    porMes.set(linha.mes, atual);
  }

  let inadimplenciaDoGrafico = BigInt(0);
  const meses = mesesDoHorizonte(entrada.hoje, entrada.horizonte).map((mes) => {
    const balde = porMes.get(mes) ?? {
      faturado: BigInt(0),
      recebido: BigInt(0),
      inadimplente: BigInt(0),
      aVencer: BigInt(0),
    };
    const explicado = balde.recebido + balde.inadimplente + balde.aVencer;
    const outros = balde.faturado > explicado ? balde.faturado - explicado : BigInt(0);
    inadimplenciaDoGrafico += balde.inadimplente;
    const situacao = situacaoDoMes(mes, entrada.hoje);
    const rotulo = rotuloMesCurto(mes);
    const faturado = textoDe(balde.faturado);
    const inadimplente = textoDe(balde.inadimplente);
    return {
      mes,
      rotulo,
      rotuloEixo: situacao === "parcial" ? `${rotulo}*` : situacao === "futuro" ? `${rotulo}†` : rotulo,
      situacao,
      faturado,
      recebido: textoDe(balde.recebido),
      inadimplente,
      aVencer: textoDe(balde.aVencer),
      outros: textoDe(outros),
      taxa: taxaInadimplencia(inadimplente, faturado),
      nota: textoSituacao(situacao, entrada.hoje),
      faturadoNum: reaisDe(balde.faturado),
      recebidoNum: reaisDe(balde.recebido),
      inadimplenteNum: reaisDe(balde.inadimplente),
      aVencerNum: reaisDe(balde.aVencer),
      outrosNum: reaisDe(outros),
    };
  });

  const inadimplente = dinheiro(entrada.resumo.inadimplente);
  const base = dinheiro(entrada.resumo.base);
  const vazio = meses.every(
    (mes) => mes.faturado === "0.00" && mes.recebido === "0.00" && mes.inadimplente === "0.00",
  );

  return {
    horizonte: entrada.horizonte,
    hoje: entrada.hoje,
    meses,
    resumo: {
      inadimplente,
      base,
      taxa: taxaInadimplencia(inadimplente, base),
      foraDoGrafico: centavosDe(inadimplente) > inadimplenciaDoGrafico,
    },
    vazio,
  };
}
