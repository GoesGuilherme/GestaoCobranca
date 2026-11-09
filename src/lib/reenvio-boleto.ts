import { provedorCodigo, statusEh } from "@/lib/status-pagamento";
import type { ContagemCanalReenvio, ItemReenvioBoleto, ResultadoReenvioBoletos } from "@/lib/tipos";
import { formaUsaTemplateBoleto } from "@/lib/whatsapp-cobranca";

export const LIMITE_REENVIO_BOLETOS = 50;

export type PassoEmissao = {
  id: string;
  naEmissao: boolean;
  ordem?: number;
  dias?: number | null;
  enviarWhatsapp?: boolean;
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

// O reenvio usa o e-mail manual do passo Na emissão e o WhatsApp que a régua
// já enfileira nesse passo. Não há outro template nem outro remetente.
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
  const base = `Reenviar ${alvo} por e-mail e WhatsApp?`;
  if (!modoTeste) return `${base} Os dois canais do passo Na emissão serão tentados.`;
  const destino = emailLogado.trim() ? ` (${emailLogado.trim()})` : "";
  return `${base} Modo teste ligado. Este envio não vai para o cliente. O e-mail vai para quem está logado${destino}. O WhatsApp segue o número de teste da régua.`;
}

function textoDeUmCanal(nome: string, canal: ContagemCanalReenvio): string {
  const partes = [canal.aceitos === 1 ? "1 aceito para envio" : `${canal.aceitos} aceitos para envio`];
  if (canal.naFila === 1) partes.push("1 na fila");
  else if (canal.naFila > 1) partes.push(`${canal.naFila} na fila`);
  if (canal.ignorados === 1) partes.push("1 ignorado");
  else if (canal.ignorados > 1) partes.push(`${canal.ignorados} ignorados`);
  if (canal.falhas === 1) partes.push("1 falhou");
  else if (canal.falhas > 1) partes.push(`${canal.falhas} falharam`);
  return `${nome}: ${partes.join(", ")}.`;
}

export function textoResumoReenvio(dados: Pick<ResultadoReenvioBoletos, "email" | "whatsapp" | "modoTeste">): string[] {
  const linhas = [textoDeUmCanal("E-mail", dados.email), textoDeUmCanal("WhatsApp", dados.whatsapp)];
  if (dados.modoTeste) linhas.push("Modo teste ligado. Nem o e-mail nem o WhatsApp foram para o cliente.");
  return linhas;
}

export function agruparMotivos(itens: Pick<ItemReenvioBoleto, "canais">[]): { motivo: string; quantidade: number }[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    for (const canalItem of item.canais) {
      if (canalItem.resultado === "aceito") continue;
      if (canalItem.resultado === "na_fila" && !canalItem.motivo?.trim()) continue;
      const prefixo = canalItem.canal === "WHATSAPP" ? "WhatsApp" : "E-mail";
      const texto = canalItem.motivo?.trim() || (canalItem.resultado === "falha" ? "Falha ao enviar." : "Ignorado.");
      const motivo = `${prefixo}: ${texto}`;
      mapa.set(motivo, (mapa.get(motivo) ?? 0) + 1);
    }
  }
  return [...mapa.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade }));
}
