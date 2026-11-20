import { somarDinheiro } from "./dinheiro";
import { tomFatura, type TomFatura } from "./fatura-situacao";
import { STATUS_NORMALIZADO } from "./status-pagamento";

export type FaturaParaResumo = {
  valor: string;
  status: string;
  excluida: boolean;
};

export type ContagemResumoFatura = {
  tom: TomFatura;
  quantidade: number;
  total: string;
};

export type GrupoResumoFatura = {
  tom: TomFatura;
  rotulo: string;
  quantidade: number;
  total: string;
};

export type ResumoFaturasFiltradas = {
  quantidade: number;
  total: string;
  grupos: GrupoResumoFatura[];
};

const GRUPOS: { tom: TomFatura; rotulo: string }[] = [
  { tom: "aberto", rotulo: "Em aberto" },
  { tom: "vencida", rotulo: "Vencidas" },
  { tom: "paga", rotulo: "Pagas" },
  { tom: "cancelada", rotulo: "Canceladas" },
  { tom: "estorno", rotulo: "Estornadas" },
  { tom: "conferencia", rotulo: "Aguardando conferência" },
];

export function resumoFaturasFiltradas(faturas: FaturaParaResumo[]): ResumoFaturasFiltradas {
  const porTom = new Map<TomFatura, string[]>();
  for (const fatura of faturas) {
    const tom = tomFatura(fatura.status, fatura.excluida);
    const lista = porTom.get(tom);
    if (lista) lista.push(fatura.valor);
    else porTom.set(tom, [fatura.valor]);
  }

  const grupos = GRUPOS.flatMap((grupo) => {
    const valores = porTom.get(grupo.tom);
    if (!valores?.length) return [];
    return [
      {
        tom: grupo.tom,
        rotulo: grupo.rotulo,
        quantidade: valores.length,
        total: somarDinheiro(valores),
      },
    ];
  });

  return {
    quantidade: faturas.length,
    total: somarDinheiro(faturas.map((fatura) => fatura.valor)),
    grupos,
  };
}

export function tomDoGrupoNormalizado(status: string | null, excluida: boolean, comprovantePendente = false): TomFatura {
  if (!excluida && comprovantePendente) return "conferencia";
  if (excluida) return "cancelada";
  if (status === STATUS_NORMALIZADO.CANCELADO) return "cancelada";
  if (status === STATUS_NORMALIZADO.VENCIDO) return "vencida";
  if (status === STATUS_NORMALIZADO.PAGO) return "paga";
  if (status === STATUS_NORMALIZADO.ESTORNADO) return "estorno";
  return "aberto";
}

export function resumoDeContagens(linhas: ContagemResumoFatura[]): ResumoFaturasFiltradas {
  const porTom = new Map<TomFatura, { quantidade: number; totais: string[] }>();
  for (const linha of linhas) {
    if (linha.quantidade <= 0) continue;
    const atual = porTom.get(linha.tom);
    if (atual) {
      atual.quantidade += linha.quantidade;
      atual.totais.push(linha.total);
    } else {
      porTom.set(linha.tom, { quantidade: linha.quantidade, totais: [linha.total] });
    }
  }

  const grupos = GRUPOS.flatMap((grupo) => {
    const item = porTom.get(grupo.tom);
    if (!item) return [];
    return [
      {
        tom: grupo.tom,
        rotulo: grupo.rotulo,
        quantidade: item.quantidade,
        total: somarDinheiro(item.totais),
      },
    ];
  });

  const quantidade = grupos.reduce((soma, grupo) => soma + grupo.quantidade, 0);
  return {
    quantidade,
    total: quantidade === 0 ? "0.00" : somarDinheiro(grupos.map((grupo) => grupo.total)),
    grupos,
  };
}

export function textoQuantidadeFaturas(quantidade: number): string {
  if (quantidade === 1) return "1 fatura";
  return `${quantidade} faturas`;
}

export function textoTotalFiltrado(quantidade: number): string {
  if (quantidade === 0) return "Nenhuma fatura com estes filtros.";
  return `${textoQuantidadeFaturas(quantidade)} · soma de todo o filtro.`;
}
