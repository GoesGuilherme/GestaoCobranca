import { somarDinheiro } from "./dinheiro";
import { tomFatura, type TomFatura } from "./fatura-situacao";

// A tela pagina de 20 em 20 no cliente. Quem chama esta função passa a lista
// filtrada inteira, a mesma que a tabela reparte em páginas.
export type FaturaParaResumo = {
  valor: string;
  status: string;
  excluida: boolean;
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

export function textoQuantidadeFaturas(quantidade: number): string {
  if (quantidade === 1) return "1 fatura";
  return `${quantidade} faturas`;
}

export function textoTotalFiltrado(quantidade: number): string {
  if (quantidade === 0) return "Nenhuma fatura com estes filtros.";
  return `${textoQuantidadeFaturas(quantidade)} · soma de todas as páginas.`;
}
