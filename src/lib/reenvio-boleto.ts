import { provedorCodigo, statusEh } from "@/lib/status-pagamento";
import type { ItemReenvioBoleto, ResultadoReenvioBoletos } from "@/lib/tipos";
import { formaUsaTemplateBoleto } from "@/lib/whatsapp-cobranca";

export const LIMITE_REENVIO_BOLETOS = 50;

export type PassoEmissao = {
  id: string;
  naEmissao: boolean;
  ordem?: number;
};

export type ReguaEmissao = {
  id: string;
  padrao: boolean;
  passos: PassoEmissao[];
};

export type FaturaParaReenvio = {
  formaCobranca: string | null;
  boletoUrl: string | null;
  excluida: boolean;
  status: string;
  provedor?: string | null;
  email?: string;
  reguaModo?: string;
  reguaId?: string | null;
};

// O reenvio em lote usa o mesmo caminho do "Enviar lembrete": o e-mail do
// passo Na emissão da régua que vale para a fatura. O WhatsApp da régua não
// entra, porque o envio manual não enfileira e a fila existente não reenvia.
export function passoEmissaoAplicavel(
  cliente: { reguaModo: string; reguaId: string | null },
  reguas: ReguaEmissao[],
): PassoEmissao | null {
  if (cliente.reguaModo === "NENHUMA") return null;
  const regua =
    cliente.reguaModo === "ESPECIFICA"
      ? reguas.find((item) => item.id === cliente.reguaId)
      : reguas.find((item) => item.padrao);
  if (!regua) return null;
  const emissoes = regua.passos
    .filter((passo) => passo.naEmissao)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  return emissoes[0] ?? null;
}

export function motivoForaDoReenvio(
  fatura: FaturaParaReenvio,
  opcoes: { modoTeste?: boolean; reguas?: ReguaEmissao[] } = {},
): string | null {
  if (!formaUsaTemplateBoleto(fatura.formaCobranca)) return "Sem boleto.";
  if (!fatura.boletoUrl?.trim()) return "Sem link do boleto.";
  if (fatura.excluida || !statusEh(fatura.status, "REGUA_ABERTA", provedorCodigo(fatura.provedor))) {
    return "Cobrança não está em aberto.";
  }
  if (opcoes.modoTeste === false && fatura.email !== undefined && !fatura.email.trim()) {
    return "Cliente sem e-mail.";
  }
  if (opcoes.reguas) {
    const modo = fatura.reguaModo ?? "PADRAO";
    if (!passoEmissaoAplicavel({ reguaModo: modo, reguaId: fatura.reguaId ?? null }, opcoes.reguas)) {
      return modo === "NENHUMA" ? "Cliente sem régua." : "Sem passo de emissão na régua.";
    }
  }
  return null;
}

export function textoAjudaReenvio(elegiveis: number, selecionados: number, foraDaPagina: number): string {
  if (elegiveis === 0) return "Nenhum boleto nesta lista.";
  if (selecionados === 0) return "Selecione um boleto.";
  if (selecionados > LIMITE_REENVIO_BOLETOS) return "No máximo 50 por vez.";
  const base = selecionados === 1 ? "1 selecionado." : `${selecionados} selecionados.`;
  if (foraDaPagina > 0) return `${base} Inclui boletos de outras páginas.`;
  return base;
}

export function textoConfirmacaoReenvio(quantidade: number, modoTeste: boolean, emailLogado = ""): string {
  const alvo = quantidade === 1 ? "1 boleto" : `${quantidade} boletos`;
  const base = `Reenviar o e-mail de emissão de ${alvo}?`;
  if (!modoTeste) return base;
  const destino = emailLogado.trim() ? ` (${emailLogado.trim()})` : "";
  return `${base} Modo teste ligado. Este envio não vai para o cliente. Vai para quem está logado${destino}.`;
}

export function textoResumoReenvio(dados: Pick<ResultadoReenvioBoletos, "aceitos" | "ignorados" | "falhas" | "modoTeste">): string[] {
  const linhas = [dados.aceitos === 1 ? "1 aceito para envio." : `${dados.aceitos} aceitos para envio.`];
  if (dados.ignorados === 1) linhas.push("1 ignorado.");
  else if (dados.ignorados > 1) linhas.push(`${dados.ignorados} ignorados.`);
  if (dados.falhas === 1) linhas.push("1 falhou.");
  else if (dados.falhas > 1) linhas.push(`${dados.falhas} falharam.`);
  if (dados.modoTeste) linhas.push("Modo teste ligado. O e-mail foi para quem está logado, não para o cliente.");
  return linhas;
}

export function agruparMotivos(itens: Pick<ItemReenvioBoleto, "resultado" | "motivo">[]): { motivo: string; quantidade: number }[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    if (item.resultado === "aceito") continue;
    const motivo = item.motivo?.trim() || (item.resultado === "falha" ? "Falha ao enviar." : "Ignorado.");
    mapa.set(motivo, (mapa.get(motivo) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade }));
}
