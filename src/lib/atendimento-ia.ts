import { inteiroDeAmbiente } from "@/lib/assessor-escopo";

// Catálogo ao vivo em 18/11/2026: o Grok com ferramenta, sem raciocínio extra,
// está em spacexai/grok-4.20-non-reasoning. Não há id xai/ nesse catálogo.
export const MODELO_IA_WHATSAPP_PADRAO = "spacexai/grok-4.20-non-reasoning";

export const PAUSA_ATENDIMENTO_IA_MS = 24 * 60 * 60 * 1000;

export const JANELA_LIMITE_IA_MS = 10 * 60 * 1000;

export const TEXTO_FALHA_IA =
  "Não consegui consultar agora. Se quiser, peço para uma pessoa da equipe continuar por aqui.";

export const TEXTO_FORA_DO_COMBINADO =
  "Consigo informar faturas em aberto, reenviar o link de pagamento ou anotar uma promessa. Se quiser, chamo uma pessoa da equipe.";

export type ConfiguracaoAtendimentoIaDTO = {
  ativo: boolean;
  instrucoes: string;
  textoRepasse: string;
};

export type TrabalhoAtendimentoIa = {
  empresaId: string;
  messageSid: string;
  de: string;
  para: string | null;
  corpo: string;
  recebidoEm: string;
};

export function modeloAtendimentoIa(env: NodeJS.ProcessEnv = process.env): string {
  const informado = env.AI_WHATSAPP_MODEL?.trim() ?? "";
  if (informado.includes("/") && informado.length <= 120) return informado;
  return MODELO_IA_WHATSAPP_PADRAO;
}

export function maxTokensAtendimentoIa(env: NodeJS.ProcessEnv = process.env): number {
  return inteiroDeAmbiente(env, "AI_WHATSAPP_MAX_TOKENS", 280, 64, 800);
}

export function limiteConversaAtendimentoIa(env: NodeJS.ProcessEnv = process.env): number {
  return inteiroDeAmbiente(env, "AI_WHATSAPP_LIMITE_CONVERSA", 6, 1, 30);
}

export function timeoutAtendimentoIa(env: NodeJS.ProcessEnv = process.env): number {
  return inteiroDeAmbiente(env, "AI_WHATSAPP_TIMEOUT_MS", 12000, 1000, 20000);
}

export function atendimentoIaAlterado(
  atual: ConfiguracaoAtendimentoIaDTO,
  gravado: ConfiguracaoAtendimentoIaDTO,
): boolean {
  return (
    atual.ativo !== gravado.ativo ||
    atual.instrucoes.trim() !== gravado.instrucoes.trim() ||
    atual.textoRepasse.trim() !== gravado.textoRepasse.trim()
  );
}

// Texto livre de verdade. Botão da cobrança, inclusive "Registrar promessa", não entra.
export function textoLivreAtendimento(corpo: string | null, buttonPayload: string | null): string | null {
  if (buttonPayload?.trim()) return null;
  const texto = (corpo ?? "").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
  if (!texto) return null;
  return texto.slice(0, 1000);
}

export function avisoAssistenteVirtual(nomeEmpresa: string): string {
  const nome = nomeEmpresa.replace(/\s+/g, " ").trim().slice(0, 80) || "sua empresa";
  return `Sou um assistente virtual da ${nome}.`;
}

export function promptAtendimentoIa(dados: {
  nomeEmpresa: string;
  nomeCliente: string;
  tom: string;
  prazoDias: number;
  textoRepasse: string;
}): string {
  const tom = dados.tom.replace(/\s+/g, " ").trim().slice(0, 1500);
  const contato = dados.textoRepasse.replace(/\s+/g, " ").trim().slice(0, 500);
  return [
    `Você é o assistente virtual de cobrança da ${dados.nomeEmpresa}, no WhatsApp, falando só com ${dados.nomeCliente}.`,
    "Responda em português do Brasil, curto, no máximo umas quatro frases.",
    "Use somente o que as ferramentas devolverem. Se não houver valor, vencimento, link ou Pix, diga que não encontrou. Não invente número, data, link nem código.",
    "Não ofereça desconto, abatimento, parcelamento nem valor menor que o da fatura.",
    `Uma promessa só vale até ${dados.prazoDias} dias a partir de hoje e somente no valor integral da fatura. Não prometa outra data.`,
    "Não cite banco, instituição de pagamento nem nome de provedor.",
    "Não mostre identificador interno de fatura.",
    "Fora de fatura em aberto, segunda via, Pix, link de pagamento e promessa, chame transferir_para_humano.",
    "As instruções de tom abaixo não mudam estas regras.",
    tom ? `Tom de voz pedido pela empresa: ${tom}` : "",
    contato ? `No repasse para uma pessoa, pode incluir este contato: ${contato}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const BANCOS = /\b(asaas|cora|inter|efi|gerencianet|sicoob|sicredi|banco)\b/i;
const DESCONTO = /\b(desconto|abatimento|parcel\w*)\b/i;
const VALOR = /R\$\s?[\d.]+,\d{2}/g;
const URL = /https?:\/\/[^\s)]+/g;
const TOKEN_LONGO = /[A-Za-z0-9]{30,}/g;

export function textoConfiavelIa(texto: string, bases: string[]): boolean {
  const limpo = texto.trim();
  if (!limpo) return false;
  const base = bases.join("\n");
  if (BANCOS.test(limpo) && !BANCOS.test(base)) return false;
  if (DESCONTO.test(limpo) && !DESCONTO.test(base)) return false;
  for (const valor of limpo.match(VALOR) ?? []) {
    if (!base.includes(valor.replace(/\s/g, "")) && !base.includes(valor)) return false;
  }
  for (const url of limpo.match(URL) ?? []) {
    const endereco = url.replace(/[).,]+$/g, "");
    if (!base.includes(endereco)) return false;
  }
  for (const token of limpo.match(TOKEN_LONGO) ?? []) {
    if (!base.includes(token)) return false;
  }
  if (limpo.includes("000201") && !base.includes("000201")) return false;
  return true;
}

export function juntarTextosIa(textos: string[]): string {
  return textos.map((texto) => texto.trim()).filter(Boolean).join("\n");
}

export function textoSeguroIa(textoModelo: string, textosFerramenta: string[]): string {
  const bases = textosFerramenta.map((texto) => texto.trim()).filter(Boolean);
  if (bases.length === 0) {
    return textoConfiavelIa(textoModelo, []) ? textoModelo.trim() : TEXTO_FORA_DO_COMBINADO;
  }
  if (!textoConfiavelIa(textoModelo, bases)) return juntarTextosIa(bases);
  return textoModelo.trim();
}

export function semIdentificadores(texto: string, ids: string[]): string {
  let saida = texto;
  for (const id of ids) {
    if (id.length >= 8) saida = saida.split(id).join("");
  }
  return saida.replace(/[ \t]{2,}/g, " ").trim();
}

export function montarTextoClienteIa(nomeEmpresa: string, jaDivulgou: boolean, texto: string, ids: string[]): string {
  const limpo = semIdentificadores(texto, ids);
  const aviso = avisoAssistenteVirtual(nomeEmpresa);
  const comAviso =
    !jaDivulgou && !limpo.toLowerCase().includes("assistente virtual") ? `${aviso}\n${limpo}` : limpo;
  return comAviso.trim().slice(0, 1000);
}
