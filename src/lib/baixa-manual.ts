import { dataHojeIso, dataIsoValida } from "./data";
import { normalizarDinheiro } from "./dinheiro";
import { provedorCodigo, statusNormalizado, STATUS_NORMALIZADO } from "./status-pagamento";
import { FORMAS_BAIXA_MANUAL } from "./validacao";

export const AVISO_BAIXA_CORA =
  "A Cora não confirma recebimento fora do boleto. O boleto foi cancelado na Cora para não ser pago de novo, e a fatura foi marcada como paga aqui.";

export const AVISO_BAIXA_LOCAL =
  "A fatura foi marcada como paga aqui. O boleto pode continuar em aberto no banco.";

export const FORMAS_BAIXA: { valor: (typeof FORMAS_BAIXA_MANUAL)[number]; rotulo: string }[] = [
  { valor: "PIX", rotulo: "Pix" },
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export type RascunhoBaixaManual = {
  pagoEm: string;
  valor: string;
  forma: string;
  nota: string;
  enviarConfirmacao: boolean;
};

export function faturaAceitaBaixaManual(fatura: {
  status: string;
  excluida: boolean;
  provedor?: string | null;
}): boolean {
  if (fatura.excluida) return false;
  const normalizado = statusNormalizado(fatura.status, provedorCodigo(fatura.provedor));
  return normalizado === STATUS_NORMALIZADO.PENDENTE || normalizado === STATUS_NORMALIZADO.VENCIDO;
}

export function avisoAntesDaBaixa(provedor: string | null | undefined): string | null {
  const codigo = provedorCodigo(provedor);
  if (codigo === "CORA") return AVISO_BAIXA_CORA;
  if (codigo === "ASAAS" || codigo === "PIX_DIRETO") return null;
  return AVISO_BAIXA_LOCAL;
}

export function valorBaixaDiverge(valor: string, valorFatura: string): boolean {
  const recebido = normalizarDinheiro(valor);
  const cobrado = normalizarDinheiro(valorFatura);
  if (!recebido || !cobrado) return false;
  return recebido !== cobrado;
}

function foto(rascunho: RascunhoBaixaManual): string {
  return JSON.stringify({
    pagoEm: rascunho.pagoEm,
    valor: normalizarDinheiro(rascunho.valor),
    forma: rascunho.forma,
    nota: rascunho.nota.trim(),
    enviarConfirmacao: rascunho.enviarConfirmacao,
  });
}

export function rascunhoBaixaValido(rascunho: RascunhoBaixaManual, hoje = dataHojeIso()): boolean {
  if (!dataIsoValida(rascunho.pagoEm) || !dataIsoValida(hoje) || rascunho.pagoEm > hoje) return false;
  const valor = normalizarDinheiro(rascunho.valor);
  if (!valor || valor === "0.00") return false;
  if (!(FORMAS_BAIXA_MANUAL as readonly string[]).includes(rascunho.forma)) return false;
  return rascunho.nota.trim().length <= 500;
}

// O Confirmar começa desligado. Só liga com o formulário válido e diferente do que abriu.
export function confirmarBaixaManualHabilitado(
  atual: RascunhoBaixaManual,
  inicial: RascunhoBaixaManual,
  hoje = dataHojeIso(),
): boolean {
  if (!rascunhoBaixaValido(atual, hoje)) return false;
  return foto(atual) !== foto(inicial);
}
