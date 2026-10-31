export type FalhaLoteVisivel = {
  id: string;
  nome: string;
  erro: string;
};

export type TomAviso = "ok" | "alerta" | "erro";

function recorrencias(quantidade: number): string {
  if (quantidade === 0) return "Nenhuma recorrência ativada";
  if (quantidade === 1) return "1 recorrência ativada";
  return `${quantidade} recorrências ativadas`;
}

function naoEntraram(quantidade: number): string {
  if (quantidade === 1) return "1 não entrou";
  return `${quantidade} não entraram`;
}

export function textoResultadoLote(criadas: number, falhas: number): string {
  if (falhas === 0) return `${recorrencias(criadas)}.`;
  return `${recorrencias(criadas)}. ${naoEntraram(falhas)}.`;
}

export function tomDoLote(criadas: number, falhas: number): TomAviso {
  if (falhas === 0) return "ok";
  if (criadas === 0) return "erro";
  return "alerta";
}

export function textoImportacaoFaturas(criadas: number, atualizadas: number, ignoradas: number): string {
  if (criadas === 0 && atualizadas === 0 && ignoradas === 0) {
    return "Nenhuma cobrança nova no Asaas para os clientes já vinculados.";
  }
  const partes = [
    criadas === 1 ? "1 fatura nova" : `${criadas} faturas novas`,
    atualizadas === 1 ? "1 atualizada" : `${atualizadas} atualizadas`,
  ];
  if (ignoradas > 0) {
    partes.push(ignoradas === 1 ? "1 ignorada" : `${ignoradas} ignoradas`);
  }
  return `${partes.join(". ")}.`;
}
