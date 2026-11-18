import { dataIsoValida } from "./data";
import { formatarReais } from "./dinheiro";
import { diferencaDias, somarDias } from "./regua";
import { TEMPLATES_COBRANCA_WHATSAPP } from "./whatsapp-cobranca";

// Modelos propostos para o botão de promessa. Não entram na publicação
// automática e não são enviados à Meta daqui. O nome _v3 é novo: um nome
// rejeitado fica bloqueado por cerca de 30 dias.
//
// O título pedido foi "Quero registrar uma promessa de pagamento" (43
// caracteres). Quick reply da Meta aceita no máximo 20. O título submetível
// fica em 19; a frase completa permanece no corpo.

export const TITULO_BOTAO_PROMESSA_PEDIDO = "Quero registrar uma promessa de pagamento";

export const TITULO_BOTAO_PROMESSA = "Registrar promessa";

export const FRASE_BOTAO_PROMESSA = "Para registrar uma promessa de pagamento, toque no botão.";

const FECHO = "Qualquer dúvida, responda esta mensagem.";

export const EXEMPLO_TOKEN_PROMESSA = `pp1_${"A".repeat(43)}`;

export const PRAZO_PROMESSA_PADRAO = 15;

export const PRAZO_PROMESSA_MIN = 1;

export const PRAZO_PROMESSA_MAX = 90;

export const REPETICOES_DATA_PROMESSA = 2;

export const EXPIRA_CONVERSA_PROMESSA_MS = 2 * 60 * 60 * 1000;

export const EXPIRA_TOKEN_PROMESSA_MS = 120 * 24 * 60 * 60 * 1000;

const TOKEN = /^pp1_[A-Za-z0-9_-]{43}$/;

export type TipoTemplatePromessa = "BOLETO_GERADO" | "VENCE_EM_DIAS" | "VENCE_HOJE" | "VENCEU";

export type TemplatePromessaProposto = {
  tipo: TipoTemplatePromessa;
  nome: string;
  idioma: "pt_BR";
  categoria: "UTILITY";
  corpo: string;
  tituloBotao: string;
  tituloPedido: string;
  variavelBotao: string;
  variaveisExemplo: Record<string, string>;
};

const CORPO_BOLETO = `Olá, {{1}}. Seu boleto de {{2}}, com vencimento em {{3}}, foi gerado. Acesse sua fatura: {{4}}. ${FRASE_BOTAO_PROMESSA} ${FECHO}`;

const CORPO_VENCE_EM_DIAS = `Olá, {{1}}. Sua cobrança de {{2}} vence em {{3}} dias, na data {{4}}. Acesse sua fatura: {{5}}. ${FRASE_BOTAO_PROMESSA} ${FECHO}`;

const CORPO_VENCE_HOJE = `Olá, {{1}}. Sua cobrança de {{2}} vence hoje, na data {{3}}. Acesse sua fatura: {{4}}. ${FRASE_BOTAO_PROMESSA} ${FECHO}`;

const CORPO_VENCEU = `Olá, {{1}}. A cobrança de {{2}}, com vencimento em {{3}}, está em atraso. Acesse sua fatura: {{4}}. ${FRASE_BOTAO_PROMESSA} ${FECHO}`;

const EXEMPLO_COMUM = {
  "1": "Maria Exemplo",
  "2": "R$ 150,00",
  "3": "30/10/2026",
  "4": "https://www.asaas.com/i/exemplo",
};

export const TEMPLATES_PROMESSA_PROPOSTOS: TemplatePromessaProposto[] = [
  {
    tipo: "BOLETO_GERADO",
    nome: "taguaro_boleto_gerado_v3",
    idioma: "pt_BR",
    categoria: "UTILITY",
    corpo: CORPO_BOLETO,
    tituloBotao: TITULO_BOTAO_PROMESSA,
    tituloPedido: TITULO_BOTAO_PROMESSA_PEDIDO,
    variavelBotao: "5",
    variaveisExemplo: { ...EXEMPLO_COMUM, "5": EXEMPLO_TOKEN_PROMESSA },
  },
  {
    tipo: "VENCE_EM_DIAS",
    nome: "taguaro_vence_em_dias_v3",
    idioma: "pt_BR",
    categoria: "UTILITY",
    corpo: CORPO_VENCE_EM_DIAS,
    tituloBotao: TITULO_BOTAO_PROMESSA,
    tituloPedido: TITULO_BOTAO_PROMESSA_PEDIDO,
    variavelBotao: "6",
    variaveisExemplo: {
      "1": "Maria Exemplo",
      "2": "R$ 150,00",
      "3": "5",
      "4": "30/10/2026",
      "5": "https://www.asaas.com/i/exemplo",
      "6": EXEMPLO_TOKEN_PROMESSA,
    },
  },
  {
    tipo: "VENCE_HOJE",
    nome: "taguaro_vence_hoje_v3",
    idioma: "pt_BR",
    categoria: "UTILITY",
    corpo: CORPO_VENCE_HOJE,
    tituloBotao: TITULO_BOTAO_PROMESSA,
    tituloPedido: TITULO_BOTAO_PROMESSA_PEDIDO,
    variavelBotao: "5",
    variaveisExemplo: { ...EXEMPLO_COMUM, "5": EXEMPLO_TOKEN_PROMESSA },
  },
  {
    tipo: "VENCEU",
    nome: "taguaro_venceu_v3",
    idioma: "pt_BR",
    categoria: "UTILITY",
    corpo: CORPO_VENCEU,
    tituloBotao: TITULO_BOTAO_PROMESSA,
    tituloPedido: TITULO_BOTAO_PROMESSA_PEDIDO,
    variavelBotao: "5",
    variaveisExemplo: { ...EXEMPLO_COMUM, "5": EXEMPLO_TOKEN_PROMESSA },
  },
];

export function templatePromessaProposto(tipo: TipoTemplatePromessa): TemplatePromessaProposto {
  const encontrado = TEMPLATES_PROMESSA_PROPOSTOS.find((item) => item.tipo === tipo);
  if (!encontrado) throw new Error("Template de promessa desconhecido.");
  return encontrado;
}

export function templatesPromessaForaDaPublicacao(): boolean {
  const publicados = new Set(TEMPLATES_COBRANCA_WHATSAPP.map((item) => item.nome));
  return TEMPLATES_PROMESSA_PROPOSTOS.every((item) => !publicados.has(item.nome));
}

export type ConteudoPromessaProposto = {
  friendly_name: string;
  language: "pt_BR";
  variables: Record<string, string>;
  types: {
    "twilio/text": { body: string };
    "twilio/quick-reply": {
      body: string;
      actions: { title: string; id: string }[];
    };
  };
};

// JSON que a Content API receberia depois da aprovação do dono.
// Esta função não chama a Twilio.
export function conteudoTwilioProposto(tipo: TipoTemplatePromessa): ConteudoPromessaProposto {
  const modelo = templatePromessaProposto(tipo);
  return {
    friendly_name: modelo.nome,
    language: modelo.idioma,
    variables: modelo.variaveisExemplo,
    types: {
      "twilio/text": { body: modelo.corpo },
      "twilio/quick-reply": {
        body: modelo.corpo,
        actions: [{ title: modelo.tituloBotao, id: `{{${modelo.variavelBotao}}}` }],
      },
    },
  };
}

export function variaveisDoTemplatePromessa(
  tipo: TipoTemplatePromessa,
  dados: { nome: string; valor: string; vencimento: string; link: string; dias?: string; token: string },
): Record<string, string> | null {
  if (!tokenPromessaValido(dados.token)) return null;
  const link = dados.link.trim();
  if (!/^https?:\/\/\S+$/i.test(link) || link.length > 500) return null;
  const nome = dados.nome.replace(/\s+/g, " ").trim().slice(0, 120) || "cliente";
  const valor = dados.valor.replace(/\s+/g, " ").trim().slice(0, 40) || "valor";
  const vencimento = dados.vencimento.replace(/\s+/g, " ").trim().slice(0, 20) || "vencimento";
  if (tipo === "VENCE_EM_DIAS") {
    const dias = (dados.dias ?? "").replace(/\D/g, "").slice(0, 3);
    if (!dias) return null;
    return { "1": nome, "2": valor, "3": dias, "4": vencimento, "5": link, "6": dados.token };
  }
  return { "1": nome, "2": valor, "3": vencimento, "4": link, "5": dados.token };
}

export function tokenPromessaValido(valor: string | null | undefined): boolean {
  return TOKEN.test(valor?.trim() ?? "");
}

export function payloadOpcaoPromessa(valor: string | null | undefined): "amanha" | "3" | "7" | "outra" | null {
  const texto = valor?.trim() ?? "";
  if (texto === "ppdata:amanha") return "amanha";
  if (texto === "ppdata:3") return "3";
  if (texto === "ppdata:7") return "7";
  if (texto === "ppdata:outra") return "outra";
  return null;
}

const ROTULO_OPCAO: Record<"amanha" | "3" | "7" | "outra", string> = {
  amanha: "Amanhã",
  "3": "Em 3 dias",
  "7": "Em 7 dias",
  outra: "Outra data",
};

export function rotuloOpcaoPromessa(opcao: "amanha" | "3" | "7" | "outra"): string {
  return ROTULO_OPCAO[opcao];
}

export function corpoVisivelPromessa(corpo: string | null, payload: string | null): string | null {
  const texto = corpo?.trim() ?? "";
  if (texto && !tokenPromessaValido(texto) && !payloadOpcaoPromessa(texto)) return texto.slice(0, 500);
  if (tokenPromessaValido(payload) || tokenPromessaValido(texto)) return TITULO_BOTAO_PROMESSA_PEDIDO;
  const opcao = payloadOpcaoPromessa(payload) ?? payloadOpcaoPromessa(texto);
  if (opcao) return rotuloOpcaoPromessa(opcao);
  return texto ? texto.slice(0, 500) : null;
}

function semAcento(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type LeituraPromessa =
  | { tipo: "opcao"; opcao: "amanha" | "3" | "7" | "outra" }
  | { tipo: "data"; iso: string }
  | { tipo: "invalida" };

export function interpretarRespostaPromessa(texto: string, payload: string | null, hoje: string): LeituraPromessa {
  const opcaoPayload = payloadOpcaoPromessa(payload);
  if (opcaoPayload) return { tipo: "opcao", opcao: opcaoPayload };
  const normal = semAcento(texto);
  if (normal === "amanha") return { tipo: "opcao", opcao: "amanha" };
  if (normal === "em 3 dias" || normal === "em tres dias" || normal === "3 dias") return { tipo: "opcao", opcao: "3" };
  if (normal === "em 7 dias" || normal === "em sete dias" || normal === "7 dias") return { tipo: "opcao", opcao: "7" };
  if (normal === "outra data" || normal === "outra") return { tipo: "opcao", opcao: "outra" };
  const iso = isoDeDataDigitada(texto, hoje);
  if (iso) return { tipo: "data", iso };
  return { tipo: "invalida" };
}

export function dataDaOpcao(opcao: "amanha" | "3" | "7", hoje: string): string | null {
  if (!dataIsoValida(hoje)) return null;
  if (opcao === "amanha") return somarDias(hoje, 1);
  if (opcao === "3") return somarDias(hoje, 3);
  return somarDias(hoje, 7);
}

export function classificarDataPromessa(
  iso: string,
  hoje: string,
  prazoDias: number,
): "ok" | "passada" | "longe" | "invalida" {
  if (!dataIsoValida(iso) || !dataIsoValida(hoje)) return "invalida";
  if (!Number.isInteger(prazoDias) || prazoDias < PRAZO_PROMESSA_MIN || prazoDias > PRAZO_PROMESSA_MAX) return "invalida";
  if (iso < hoje) return "passada";
  if (diferencaDias(hoje, iso) > prazoDias) return "longe";
  return "ok";
}

function isoDeDataDigitada(texto: string, hoje: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(texto.trim());
  if (!match || !dataIsoValida(hoje)) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const anoInformado = match[3] ? Number(match[3]) : null;
  const anoBase = anoInformado ?? Number(hoje.slice(0, 4));
  const iso = montarIso(anoBase, mes, dia);
  if (!iso) return null;
  if (anoInformado !== null) return iso;
  if (iso < hoje) return montarIso(anoBase + 1, mes, dia);
  return iso;
}

function montarIso(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return dataIsoValida(iso) ? iso : null;
}

export function diaMes(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}`;
}

export function textoPedidoData(valor: string): string {
  return [
    `Quando você pretende pagar a cobrança de ${valor}?`,
    "",
    "Responda com uma destas opções:",
    "Amanhã",
    "Em 3 dias",
    "Em 7 dias",
    "Outra data",
  ].join("\n");
}

export function textoOutraData(): string {
  return "Envie a data no formato dd/mm ou dd/mm/aaaa. Exemplo: 20/11 ou 20/11/2026.";
}

export function textoConfirmacaoPromessa(valor: string, iso: string): string {
  return `Anotado: pagamento de ${valor} até ${diaMes(iso)}`;
}

export function textoPrazoPromessa(dias: number, limite: string): string {
  const quantidade = dias === 1 ? "1 dia" : `${dias} dias`;
  return `Essa data passa do prazo de ${quantidade}. Escolha uma data até ${diaMes(limite)}.`;
}

export function textoDataPassada(): string {
  return "Essa data já passou. Escolha Amanhã, Em 3 dias, Em 7 dias ou Outra data.";
}

export function textoDataInvalida(): string {
  return "Não entendi a data. Responda Amanhã, Em 3 dias, Em 7 dias ou Outra data.";
}

export function textoDataEncerrada(): string {
  return "Não consegui entender a data. Nada foi registrado. Quando quiser, toque de novo no botão da cobrança.";
}

export function textoPromessaExistente(): string {
  return "Esta cobrança já tem uma promessa de pagamento em aberto. Nada de novo foi registrado.";
}

export function textoCobrancaEncerrada(): string {
  return "Esta cobrança não está mais em aberto. Nada foi registrado.";
}

export function textoNumeroNaoConfere(): string {
  return "Não consegui confirmar este número para a cobrança. Nada foi registrado.";
}

export function textoSemConversaPromessa(): string {
  return "Para registrar a promessa, toque de novo no botão da cobrança.";
}

export function proximaTentativaPromessa(tentativas: number): "repetir" | "encerrar" {
  return tentativas >= REPETICOES_DATA_PROMESSA ? "encerrar" : "repetir";
}

export function salvarPrazoPromessaHabilitado(texto: string, gravado: number): boolean {
  if (!/^\d{1,2}$/.test(texto.trim())) return false;
  const dias = Number(texto.trim());
  if (!Number.isInteger(dias) || dias < PRAZO_PROMESSA_MIN || dias > PRAZO_PROMESSA_MAX) return false;
  return dias !== gravado;
}

export function valorConfirmado(centavos: string): string {
  return formatarReais(centavos);
}
