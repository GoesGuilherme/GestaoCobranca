import { dataIsoValida } from "./data";
import { somenteDigitos } from "./documento";
import { nomePassoConfigurado } from "./regua";
import { digitosWhatsapp } from "./whatsapp-cobranca";

export const STATUS_MENSAGEM = [
  { valor: "NA_FILA", rotulo: "Na fila" },
  { valor: "ENVIADA", rotulo: "Enviada" },
  { valor: "ENTREGUE", rotulo: "Entregue" },
  { valor: "LIDA", rotulo: "Lida" },
  { valor: "FALHOU", rotulo: "Falhou" },
  { valor: "NAO_ENTREGUE", rotulo: "Não entregue" },
  { valor: "NAO_ENVIADA", rotulo: "Não enviada" },
] as const;

export type StatusMensagem = (typeof STATUS_MENSAGEM)[number]["valor"];

export const CANAIS_MENSAGEM = [
  { valor: "WHATSAPP", rotulo: "WhatsApp" },
  { valor: "SMS", rotulo: "SMS" },
] as const;

export type CanalMensagem = (typeof CANAIS_MENSAGEM)[number]["valor"];

export const PERIODOS_MENSAGEM = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "personalizado", rotulo: "Personalizado" },
  { valor: "todos", rotulo: "Todo o período" },
] as const;

export type PeriodoMensagem = (typeof PERIODOS_MENSAGEM)[number]["valor"];

const GRAU = ["queued", "sent", "delivered", "read"];

const CODIGOS_ERRO: Record<string, string> = {
  "21211": "O número de destino é inválido.",
  "21610": "Este número pediu para não receber mensagens.",
  "21614": "O destino não é um celular.",
  "30003": "O celular de destino estava inacessível.",
  "30004": "A mensagem foi bloqueada.",
  "30005": "O número de destino é desconhecido.",
  "30006": "O destino é um telefone fixo ou não recebe esta mensagem.",
  "30007": "A operadora filtrou a mensagem.",
  "30008": "A operadora devolveu um erro desconhecido.",
  "30034": "O número de origem não está liberado para SMS.",
  "63001": "O WhatsApp não autenticou o envio.",
  "63003": "O WhatsApp não encontrou este número.",
  "63005": "O WhatsApp não aceitou o conteúdo.",
  "63007": "O número de origem do WhatsApp não foi encontrado.",
  "63013": "A mensagem viola a política do WhatsApp.",
  "63014": "O WhatsApp bloqueou a mensagem.",
  "63015": "Este número ainda não entrou no sandbox do WhatsApp.",
  "63016": "Fora da janela de 24 horas. Só um modelo aprovado pode ser enviado.",
  "63018": "A Twilio limitou o ritmo de envio.",
  "63021": "O conteúdo não é válido para o WhatsApp.",
  "63024": "O destinatário do WhatsApp é inválido.",
  "63032": "O modelo de mensagem não está aprovado.",
  "63049": "A Meta não entregou esta mensagem.",
};

export const TEXTO_FORA_DA_JANELA =
  "A janela de 24 horas fechou. Fora dela o WhatsApp não aceita texto livre, só um modelo já aprovado. A régua continua enviando esses modelos.";

export const TEXTO_SEM_ENTRADA =
  "Este número ainda não respondeu. Sem uma mensagem dele nas últimas 24 horas, o texto livre fica bloqueado. Só um modelo aprovado pode ser enviado.";

export const TEXTO_OPT_OUT = "Este número pediu para parar de receber mensagens. A resposta fica bloqueada.";

export function rotuloStatusMensagem(status: StatusMensagem): string {
  return STATUS_MENSAGEM.find((item) => item.valor === status)?.rotulo ?? status;
}

export function rotuloCanalMensagem(canal: string): string {
  if (canal === "SMS") return "SMS";
  return "WhatsApp";
}

export function rotuloStatusTwilio(status: string): string {
  const nome = status.trim().toLowerCase();
  if (nome === "queued" || nome === "accepted" || nome === "sending") return "Na fila";
  if (nome === "sent") return "Enviada";
  if (nome === "delivered") return "Entregue";
  if (nome === "read") return "Lida";
  if (nome === "failed") return "Falhou";
  if (nome === "undelivered") return "Não entregue";
  if (nome === "received" || nome === "recebida") return "Recebida";
  return status;
}

export function codigoErroDoMotivo(motivo: string | null): string | null {
  const match = /^Twilio\s+(\d{3,6})$/i.exec((motivo ?? "").trim());
  return match?.[1] ?? null;
}

export function motivoLegivel(motivo: string | null, detalhe: string | null = null): string | null {
  const codigo = codigoErroDoMotivo(motivo);
  if (codigo) {
    const texto = CODIGOS_ERRO[codigo] ?? "A Twilio recusou a mensagem.";
    const extra = detalhe?.trim();
    if (extra && extra !== texto) return `${codigo} — ${texto} ${extra}`;
    return `${codigo} — ${texto}`;
  }
  const nome = statusTwilioDoMotivo(motivo);
  if (nome) return null;
  const texto = motivo?.trim() ?? "";
  if (!texto) return detalhe?.trim() || null;
  return texto;
}

function statusTwilioDoMotivo(motivo: string | null): string | null {
  const match = /^Twilio\s+([a-z]+)$/i.exec((motivo ?? "").trim());
  if (!match) return null;
  const nome = match[1].toLowerCase();
  if (nome === "queued" || nome === "accepted" || nome === "sending" || nome === "sent" || nome === "delivered" || nome === "read" || nome === "failed" || nome === "undelivered") {
    return nome;
  }
  return null;
}

function classificarNomes(nomes: string[]): StatusMensagem | null {
  let melhor = -1;
  let falhaDepois = false;
  let tipoFalha: "failed" | "undelivered" | null = null;
  for (const bruto of nomes) {
    const nome = bruto.trim().toLowerCase();
    const grauNome = nome === "accepted" || nome === "sending" ? "queued" : nome;
    const grau = GRAU.indexOf(grauNome);
    if (grau >= 0) {
      if (grau >= melhor) {
        melhor = grau;
        falhaDepois = false;
      }
      continue;
    }
    if (nome === "failed" || nome === "undelivered") {
      tipoFalha = nome;
      falhaDepois = true;
    }
  }
  if (falhaDepois && tipoFalha === "undelivered") return "NAO_ENTREGUE";
  if (falhaDepois && tipoFalha === "failed") return "FALHOU";
  if (melhor >= GRAU.indexOf("read")) return "LIDA";
  if (melhor >= GRAU.indexOf("delivered")) return "ENTREGUE";
  if (melhor >= GRAU.indexOf("sent")) return "ENVIADA";
  if (melhor >= 0) return "NA_FILA";
  return null;
}

export function statusDaMensagem(entrada: {
  statusFila: string;
  motivo: string | null;
  eventos: string[];
}): StatusMensagem {
  const pelosEventos = classificarNomes(entrada.eventos);
  if (pelosEventos) return pelosEventos;
  const nomes: string[] = [];
  const doMotivo = statusTwilioDoMotivo(entrada.motivo);
  if (doMotivo) nomes.push(doMotivo);
  if (codigoErroDoMotivo(entrada.motivo)) nomes.push("failed");
  const peloMotivo = classificarNomes(nomes);
  if (peloMotivo) return peloMotivo;
  if (entrada.statusFila === "PENDENTE" || entrada.statusFila === "PROCESSANDO") return "NA_FILA";
  if (entrada.statusFila === "ENVIADO") return "ENVIADA";
  if (entrada.statusFila === "FALHOU") return "FALHOU";
  return "NAO_ENVIADA";
}

export function canalDoDestino(destino: string | null): CanalMensagem {
  if (destino && !destino.toLowerCase().startsWith("whatsapp:")) return "SMS";
  return "WHATSAPP";
}

export function chaveTelefone(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const semCanal = valor.replace(/^whatsapp:/i, "").trim();
  const whatsapp = digitosWhatsapp(semCanal);
  if (whatsapp) return whatsapp;
  const digitos = somenteDigitos(semCanal);
  if (digitos.length >= 10 && digitos.length <= 15) return digitos;
  return null;
}

export function formatarTelefone(digitos: string): string {
  const nacional = digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13) ? digitos.slice(2) : digitos;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return digitos.startsWith("55") ? `+${digitos}` : digitos;
}

export function rotuloDoEnvio(entrada: {
  tipo: string;
  rotulo: string;
  passo: { naEmissao: boolean; dias: number | null; assunto?: string; reguaNome: string } | null;
}): string {
  if (entrada.rotulo.trim() === "WhatsApp · link do cartão") return "Envio do link do cartão";
  if (entrada.passo) {
    return `Régua · ${entrada.passo.reguaNome} · ${nomePassoConfigurado(entrada.passo)}`;
  }
  if (entrada.tipo === "PAGO") return "Aviso de pagamento";
  return entrada.rotulo.trim() || "Envio da régua";
}

export function textoDoEnvio(rotulo: string, variaveis: string): string {
  let dados: Record<string, unknown> = {};
  try {
    const json = JSON.parse(variaveis) as unknown;
    if (json && typeof json === "object" && !Array.isArray(json)) dados = json as Record<string, unknown>;
  } catch {
    dados = {};
  }
  const partes = [dados["1"], dados["2"]]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  const base = rotulo.trim() || "Mensagem de WhatsApp";
  return partes.length > 0 ? `${base} (${partes.join(", ")})` : base;
}

function somarDias(iso: string, dias: number): string {
  const data = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  data.setUTCDate(data.getUTCDate() + dias);
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Brasília não tem horário de verão desde 2019: o dia civil é UTC−3.
export function instanteInicioBrt(iso: string): Date | null {
  if (!dataIsoValida(iso)) return null;
  return new Date(`${iso}T00:00:00.000-03:00`);
}

export function instanteFimBrt(iso: string): Date | null {
  if (!dataIsoValida(iso)) return null;
  return new Date(`${iso}T23:59:59.999-03:00`);
}

export function lerPeriodoMensagens(
  params: { periodo?: string; de?: string; ate?: string },
  hoje: string,
): { periodo: PeriodoMensagem; de: string; ate: string; inicio: Date | null; fim: Date | null } {
  const bruto = params.periodo?.trim() ?? "";
  const periodo: PeriodoMensagem = PERIODOS_MENSAGEM.some((item) => item.valor === bruto)
    ? (bruto as PeriodoMensagem)
    : "30";
  if (periodo === "todos") return { periodo, de: "", ate: "", inicio: null, fim: null };
  if (periodo === "personalizado") {
    const de = dataIsoValida(params.de ?? "") ? (params.de as string) : "";
    const ate = dataIsoValida(params.ate ?? "") ? (params.ate as string) : "";
    return { periodo, de, ate, inicio: de ? instanteInicioBrt(de) : null, fim: ate ? instanteFimBrt(ate) : null };
  }
  const dias = Number(periodo);
  const de = somarDias(hoje, -(dias - 1));
  return { periodo, de, ate: hoje, inicio: instanteInicioBrt(de), fim: instanteFimBrt(hoje) };
}

export function statusMensagemValido(valor: string | undefined): StatusMensagem | "" {
  if (!valor) return "";
  return STATUS_MENSAGEM.some((item) => item.valor === valor) ? (valor as StatusMensagem) : "";
}

export function canalMensagemValido(valor: string | undefined): CanalMensagem | "" {
  if (valor === "WHATSAPP" || valor === "SMS") return valor;
  return "";
}
