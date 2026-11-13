import type { ResultadoReenvioBoletos } from "@/lib/tipos";
import { provedorCodigo, type ProvedorCodigo } from "@/lib/status-pagamento";
import { esquemaAlteracaoFatura } from "@/lib/validacao";
import { textoResumoReenvio } from "@/lib/reenvio-boleto";

const ABERTAS: Partial<Record<ProvedorCodigo, readonly string[]>> = {
  ASAAS: ["PENDING", "OVERDUE"],
  CORA: ["OPEN", "LATE"],
  INTER: ["A_RECEBER", "ATRASADO"],
};

export const AVISO_ALTERACAO_CORA =
  "Ao salvar, a Cora cancela o boleto atual e emite outro. O código de barras e a linha digitável mudam. O vínculo com a recorrência permanece.";

export const ERRO_REEMISSAO_CORA =
  "O boleto anterior foi cancelado na Cora e a nova emissão não foi confirmada. Salve de novo para gerar o boleto.";

export function reemissaoCoraPendente(erro: string | null | undefined): boolean {
  return erro === ERRO_REEMISSAO_CORA;
}

export function descricaoNormalizada(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? "";
  return texto ? texto : null;
}

export type CamposAlteracao = {
  valor: string;
  vencimento: string;
  descricao: string | null;
};

export function alteracaoMudou(atual: CamposAlteracao, nova: CamposAlteracao): boolean {
  return (
    atual.valor !== nova.valor ||
    atual.vencimento !== nova.vencimento ||
    descricaoNormalizada(atual.descricao) !== descricaoNormalizada(nova.descricao)
  );
}

export function faturaPodeSerAlterada(fatura: {
  status: string;
  excluida: boolean;
  provedor?: string | null;
}): boolean {
  if (fatura.excluida) return false;
  const provedor = provedorCodigo(fatura.provedor);
  const abertas = ABERTAS[provedor];
  if (!abertas) return false;
  return abertas.includes(fatura.status.trim().toUpperCase());
}

export function motivoFaturaNaoAlteravel(fatura: {
  status: string;
  excluida: boolean;
  provedor?: string | null;
}): string {
  if (fatura.excluida) return "Cobrança cancelada não pode ser alterada.";
  const provedor = provedorCodigo(fatura.provedor);
  if (provedor === "INTER" && fatura.status.trim().toUpperCase() === "PROTESTO") {
    return "Boleto em protesto no Inter não pode ser alterado por aqui.";
  }
  if (!ABERTAS[provedor]) return "Este provedor ainda não permite alterar o boleto emitido.";
  return "Só dá para alterar cobrança em aberto ou vencida.";
}

export function salvarAlteracaoHabilitado(
  entrada: { valor: string; vencimento: string; descricao: string },
  atual: CamposAlteracao,
): boolean {
  const validado = esquemaAlteracaoFatura.safeParse(entrada);
  if (!validado.success) return false;
  return alteracaoMudou(atual, {
    valor: validado.data.valor,
    vencimento: validado.data.vencimento,
    descricao: descricaoNormalizada(validado.data.descricao),
  });
}

export function textoToastAlteracao(
  reenvio: Pick<ResultadoReenvioBoletos, "email" | "whatsapp" | "modoTeste">,
  reemitido: boolean,
): string {
  const cabeca = reemitido ? "Boleto cancelado na Cora e um novo foi emitido." : "Boleto alterado.";
  return [cabeca, ...textoResumoReenvio(reenvio)].join(" ");
}
