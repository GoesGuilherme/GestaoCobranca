import { nomePassoConfigurado } from "./regua";
import type { CanalMensagem, StatusMensagem } from "./mensagens-twilio";
import {
  ROTULO_WHATSAPP_LINK_CARTAO,
  ROTULO_WHATSAPP_PIX,
  templateCobrancaWhatsapp,
  type TipoTemplateWhatsapp,
} from "./whatsapp-cobranca";

const FUSO = "America/Sao_Paulo";

const TIPOS_TEMPLATE = new Set<string>(["BOLETO_GERADO", "VENCE_EM_DIAS", "VENCE_HOJE", "VENCEU", "PAGO"]);

export type TickMensagem = "fila" | "enviada" | "entregue" | "lida" | "falha" | "nao_enviada";

export type ResumoConversa = {
  telefone: string;
  telefoneExibicao: string;
  nomes: string;
  clienteId: string | null;
  clienteIds: string[];
  ultimaEm: string;
  previa: string;
  naoLidas: number;
  fotoUrl: string | null;
  canal: CanalMensagem | null;
};

export type BolhaConversa = {
  id: string;
  lado: "empresa" | "cliente";
  quando: string;
  texto: string;
  detalhe: string | null;
  origem: string | null;
  template: string | null;
  cobrancaId: string | null;
  cobranca: string | null;
  canal: CanalMensagem | null;
  ticks: TickMensagem | null;
  motivo: string | null;
  modoTeste: boolean;
};

export type ConversaMensagens = {
  telefone: string;
  telefoneExibicao: string;
  clientes: { id: string; nome: string }[];
  naoLidas: number;
  janelaAberta: boolean;
  janelaAte: string | null;
  optOut: boolean;
  aviso: string | null;
  bolhas: BolhaConversa[];
  proximoCursor: string | null;
};

export type PaginaCaixa = {
  conversas: ResumoConversa[];
  proximoCursor: string | null;
};

const CHAVES_CAIXA = ["periodo", "de", "ate", "status", "canal", "cliente", "q", "conversa"] as const;

export function iniciaisDoNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo || limpo === "Número sem cadastro") return "?";
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes[partes.length - 1]?.[0] ?? "";
  return `${primeira}${ultima}`.toUpperCase();
}

export function ticksDoStatus(status: StatusMensagem): TickMensagem {
  if (status === "LIDA") return "lida";
  if (status === "ENTREGUE") return "entregue";
  if (status === "ENVIADA") return "enviada";
  if (status === "NA_FILA") return "fila";
  if (status === "FALHOU" || status === "NAO_ENTREGUE") return "falha";
  return "nao_enviada";
}

export function nomeTemplateDoTipo(tipo: string): string | null {
  if (!TIPOS_TEMPLATE.has(tipo)) return null;
  return templateCobrancaWhatsapp(tipo as TipoTemplateWhatsapp).nome;
}

export function origemDoEnvio(entrada: {
  tipo: string;
  rotulo: string;
  passo: { naEmissao: boolean; dias: number | null; assunto?: string } | null;
}): { origem: string; template: string | null } {
  const template = nomeTemplateDoTipo(entrada.tipo);
  if (entrada.passo) {
    return { origem: `Régua · ${nomePassoConfigurado(entrada.passo)}`, template };
  }
  const rotulo = entrada.rotulo.trim();
  if (rotulo === ROTULO_WHATSAPP_LINK_CARTAO || rotulo === ROTULO_WHATSAPP_PIX) {
    return { origem: "Manual", template: null };
  }
  if (template) return { origem: template, template };
  return { origem: "Manual", template: null };
}

export function diaCivilSaoPaulo(iso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const ano = partes.find((parte) => parte.type === "year")?.value ?? "0000";
  const mes = partes.find((parte) => parte.type === "month")?.value ?? "00";
  const dia = partes.find((parte) => parte.type === "day")?.value ?? "00";
  return `${ano}-${mes}-${dia}`;
}

function diaAnterior(isoDia: string): string {
  const [ano, mes, dia] = isoDia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() - 1);
  const a = data.getUTCFullYear();
  const m = String(data.getUTCMonth() + 1).padStart(2, "0");
  const d = String(data.getUTCDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

export function rotuloDiaConversa(iso: string, agora: Date): string {
  const dia = diaCivilSaoPaulo(iso);
  const hoje = diaCivilSaoPaulo(agora.toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === diaAnterior(hoje)) return "Ontem";
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

export function horaSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function horarioListaConversa(iso: string, agora: Date): string {
  const rotulo = rotuloDiaConversa(iso, agora);
  if (rotulo === "Hoje") return horaSaoPaulo(iso);
  if (rotulo === "Ontem") return "Ontem";
  return rotulo;
}

export function gruposPorDia<T extends { quando: string }>(itens: T[], agora: Date): { rotulo: string; itens: T[] }[] {
  const grupos: { rotulo: string; chave: string; itens: T[] }[] = [];
  for (const item of itens) {
    const chave = diaCivilSaoPaulo(item.quando);
    const ultimo = grupos.at(-1);
    if (!ultimo || ultimo.chave !== chave) {
      grupos.push({ chave, rotulo: rotuloDiaConversa(item.quando, agora), itens: [item] });
    } else {
      ultimo.itens.push(item);
    }
  }
  return grupos.map(({ rotulo, itens: doDia }) => ({ rotulo, itens: doDia }));
}

export function legendaDaBolha(bolha: BolhaConversa): string | null {
  if (bolha.lado === "cliente") return bolha.origem;
  const partes = [
    bolha.canal === "SMS" ? "SMS" : null,
    bolha.origem,
    bolha.template && bolha.template !== bolha.origem ? bolha.template : null,
  ].filter((parte): parte is string => Boolean(parte));
  return partes.length > 0 ? partes.join(" · ") : null;
}

export function urlCaixaMensagens(params: Record<string, string | undefined>): string {
  const consulta = new URLSearchParams();
  for (const chave of CHAVES_CAIXA) {
    const valor = params[chave]?.trim();
    if (valor) consulta.set(chave, valor);
  }
  const texto = consulta.toString();
  return texto ? `/mensagens?${texto}` : "/mensagens";
}

// Abas antigas (?aba=envios e ?aba=conversas) e o detalhe ?mensagem= caem na caixa única.
// O período da aba Envios, quando não vinha na URL, era 30 dias.
export function urlSemAbasMensagens(params: Record<string, string | undefined>): string | null {
  if (!params.aba && !params.mensagem) return null;
  const proximo: Record<string, string | undefined> = { ...params };
  if (params.aba === "envios" && !params.periodo?.trim()) proximo.periodo = "30";
  delete proximo.aba;
  delete proximo.mensagem;
  return urlCaixaMensagens(proximo);
}

export function codificarCursorConversa(quandoIso: string, telefone: string): string {
  return `${quandoIso}|${telefone}`;
}

export function lerCursorConversa(valor: string | null | undefined): { quando: Date; telefone: string } | null {
  if (!valor) return null;
  const separador = valor.lastIndexOf("|");
  if (separador <= 0) return null;
  const iso = valor.slice(0, separador);
  const telefone = valor.slice(separador + 1);
  if (!/^\d{10,15}$/.test(telefone)) return null;
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;
  return { quando, telefone };
}

export function codificarCursorMensagem(quandoIso: string): string {
  return quandoIso;
}

export function lerCursorMensagem(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const quando = new Date(valor);
  if (Number.isNaN(quando.getTime())) return null;
  return quando;
}

export function conversaJaListada(ultimaIso: string, telefone: string, cursor: { quando: Date; telefone: string } | null): boolean {
  if (!cursor) return false;
  const momento = new Date(ultimaIso).getTime();
  const corte = cursor.quando.getTime();
  if (momento > corte) return true;
  if (momento < corte) return false;
  return telefone >= cursor.telefone;
}

export function filtrosCaixaAtivos(filtro: { periodo: string; status: string; canal: string; clienteId: string }): number {
  let total = 0;
  if (filtro.periodo !== "todos") total += 1;
  if (filtro.status) total += 1;
  if (filtro.canal) total += 1;
  if (filtro.clienteId) total += 1;
  return total;
}
