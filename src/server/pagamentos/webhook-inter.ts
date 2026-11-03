import { dataHojeIso } from "@/lib/data";
import { statusNormalizado, STATUS_NORMALIZADO } from "@/lib/status-pagamento";
import type { EventoNormalizado, MeioPagamento } from "./tipos";

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function dataSituacao(valor: string | null): string | null {
  if (!valor) return null;
  const instante = new Date(valor);
  if (!Number.isNaN(instante.getTime())) return dataHojeIso(instante);
  const data = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return data ? data[1] : null;
}

function meioDe(origem: string | null): MeioPagamento | null {
  if (origem === "PIX") return "PIX";
  if (origem === "BOLETO") return "BOLETO";
  return null;
}

function umEvento(bruto: unknown): EventoNormalizado | null {
  if (!bruto || typeof bruto !== "object") return null;
  const corpo = bruto as Record<string, unknown>;
  const idExterno = texto(corpo.codigoSolicitacao, 80);
  const situacao = texto(corpo.situacao, 40)?.toUpperCase() ?? null;
  if (!idExterno || !situacao) return null;
  const quando = texto(corpo.dataHoraSituacao, 40);
  const status = statusNormalizado(situacao, "INTER");
  const origem = texto(corpo.origemRecebimento, 16)?.toUpperCase() ?? null;
  return {
    idEvento: `${idExterno}:${situacao}:${quando ?? ""}`.slice(0, 200),
    idExterno,
    tipo: situacao,
    status,
    statusBruto: situacao,
    pagoEm: status === STATUS_NORMALIZADO.PAGO ? dataSituacao(quando) : null,
    valor: texto(corpo.valorTotalRecebido, 40) ?? texto(corpo.valorNominal, 40),
    meio: meioDe(origem),
    visualizacao: false,
    alteraCobranca: status !== null,
    confirmaPagamento: status === STATUS_NORMALIZADO.PAGO,
    bruto,
  };
}

// O Inter manda uma lista. Também aceitamos um objeto único, para o teste e para
// um callback que chegue sem o colchete.
export function normalizarWebhookInter(corpo: unknown): EventoNormalizado[] {
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  return lista.flatMap((item) => {
    const evento = umEvento(item);
    return evento ? [evento] : [];
  });
}
