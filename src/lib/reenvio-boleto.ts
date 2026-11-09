import { formaUsaTemplateBoleto } from "@/lib/whatsapp-cobranca";
import { provedorCodigo, statusEh } from "@/lib/status-pagamento";
import type { ItemReenvioBoleto, SituacaoReenvioBoleto } from "@/lib/tipos";

export const TETO_REENVIO_BOLETOS_JANELA = 80;
export const JANELA_REENVIO_BOLETOS_MS = 10 * 60 * 1000;

export function cobrancaAbertaNaRegua(status: string, provedor?: string | null): boolean {
  const codigo = provedorCodigo(provedor);
  if (statusEh(status, "REGUA_ABERTA", codigo)) return true;
  // A lista de faturas não carrega o provedor. A_RECEBER e ATRASADO não existem no Asaas.
  if (!provedor && codigo === "ASAAS" && statusEh(status, "REGUA_ABERTA", "INTER")) return true;
  return false;
}

/** Motivo curto para a caixa da lista. Nulo quando o boleto pode ser selecionado. */
export function motivoForaDaSelecaoBoleto(fatura: {
  formaCobranca: string;
  boletoUrl: string | null;
  excluida: boolean;
  status: string;
  provedor?: string | null;
}): string | null {
  if (fatura.excluida) return "Cancelada";
  if (!formaUsaTemplateBoleto(fatura.formaCobranca)) return "Não é boleto";
  if (!fatura.boletoUrl?.trim()) return "Sem boleto";
  if (!cobrancaAbertaNaRegua(fatura.status, fatura.provedor)) return "Não está em aberto";
  return null;
}

function contar(itens: ItemReenvioBoleto[], canal: "email" | "whatsapp", situacao: SituacaoReenvioBoleto) {
  return itens.filter((item) => item[canal] === situacao).length;
}

function frase(quantidade: number, um: string, varios: string) {
  return quantidade === 1 ? `1 ${um}` : `${quantidade} ${varios}`;
}

export function textoResultadoReenvio(itens: ItemReenvioBoleto[]): { resumo: string; detalhes: string[] } {
  const emailsAceitos = contar(itens, "email", "aceito");
  const emailsIgnorados = contar(itens, "email", "ignorado");
  const emailsFalhas = contar(itens, "email", "falhou");
  const whatsappAceitos = contar(itens, "whatsapp", "aceito");
  const whatsappFila = contar(itens, "whatsapp", "na_fila");
  const whatsappExistentes = contar(itens, "whatsapp", "ja_existia");
  const whatsappIgnorados = contar(itens, "whatsapp", "ignorado");
  const whatsappFalhas = contar(itens, "whatsapp", "falhou");

  const partesWhatsapp = [
    whatsappAceitos > 0 ? `${frase(whatsappAceitos, "aceito pela Twilio", "aceitos pela Twilio")}.` : "",
    whatsappFila > 0 ? `${frase(whatsappFila, "ainda na fila", "ainda na fila")}.` : "",
    whatsappExistentes > 0 ? `${frase(whatsappExistentes, "já estava na fila", "já estavam na fila")}.` : "",
    whatsappIgnorados > 0 ? `${frase(whatsappIgnorados, "ignorado", "ignorados")}.` : "",
    whatsappFalhas > 0 ? `${frase(whatsappFalhas, "com falha", "com falha")}.` : "",
  ].filter(Boolean);
  const partes = [
    `${frase(emailsAceitos, "e-mail aceito", "e-mails aceitos")}.`,
    emailsIgnorados > 0 ? `${frase(emailsIgnorados, "e-mail ignorado", "e-mails ignorados")}.` : "",
    emailsFalhas > 0 ? `${frase(emailsFalhas, "e-mail com falha", "e-mails com falha")}.` : "",
    partesWhatsapp.length > 0 ? `WhatsApp: ${partesWhatsapp.join(" ")}` : "Nenhum WhatsApp novo.",
    "Aceito significa que o envio foi registrado. Não confirma que a mensagem chegou.",
  ];

  const detalhes = itens.flatMap((item) => {
    const notas: string[] = [];
    if (item.email !== "aceito") notas.push(`E-mail: ${item.emailMotivo ?? "não aceito"}`);
    if (item.whatsapp === "aceito" || item.whatsapp === "nao_aplica") {
      // O resumo já conta o aceito. Passo sem WhatsApp não é falha.
    } else {
      notas.push(`WhatsApp: ${item.whatsappMotivo ?? "não aceito"}`);
    }
    if (notas.length === 0) return [];
    return [`${item.nomeCliente ?? "Fatura"}: ${notas.join(". ")}`];
  });

  return { resumo: partes.filter(Boolean).join(" "), detalhes };
}
