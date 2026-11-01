import { tomFatura } from "./fatura-situacao";
import type { ModoReguaCliente } from "./tipos";

export type MomentoEtapa = "antes" | "vencimento" | "atraso";
export type MarcoRegua = MomentoEtapa | "pago";

export type PassoDaRegua = {
  id: string;
  ordem?: number;
  naEmissao: boolean;
  dias: number | null;
};

export type ReguaParaProgresso = {
  id: string;
  padrao: boolean;
  nome: string;
  passos: PassoDaRegua[];
};

export type EnvioReguaLista = {
  faturaId: string;
  passoId: string | null;
  canal: string;
  status: string;
};

export type LembreteMarco = {
  nome: string;
  canais: string[];
};

export type IconeRegua = {
  id: MarcoRegua;
  nome: string;
  aceso: boolean;
  lembretes: LembreteMarco[];
};

export type ProgressoRegua = {
  neutra: boolean;
  paga: boolean;
  icones: [IconeRegua, IconeRegua, IconeRegua, IconeRegua];
};

const ORDEM_CANAL = ["EMAIL", "WHATSAPP"];
const NOMES: Record<MarcoRegua, string> = {
  antes: "Antes do vencimento",
  vencimento: "No vencimento",
  atraso: "Depois do vencimento",
  pago: "Pago",
};

export function nomeEtapaRegua(passo: { naEmissao: boolean; dias: number | null }): string {
  if (passo.naEmissao) return "Na emissão";
  const dias = passo.dias ?? 0;
  if (dias === 0) return "No vencimento";
  if (dias < 0) {
    const n = Math.abs(dias);
    return n === 1 ? "Lembrete 1 dia antes" : `Lembrete ${n} dias antes`;
  }
  return dias === 1 ? "1 dia após" : `${dias} dias após`;
}

export function momentoEtapaRegua(passo: { naEmissao: boolean; dias: number | null }): MomentoEtapa {
  if (passo.naEmissao) return "antes";
  const dias = passo.dias ?? 0;
  if (dias < 0) return "antes";
  if (dias === 0) return "vencimento";
  return "atraso";
}

export function textoIcone(icone: IconeRegua, neutra: boolean): string {
  const enviados = icone.lembretes.map((lembrete) => `${lembrete.nome} por ${rotuloCanais(lembrete.canais)}`);
  if (neutra) {
    return enviados.length > 0 ? `${icone.nome} · encerrada · ${enviados.join(" · ")}` : `${icone.nome} · encerrada`;
  }
  if (!icone.aceso) {
    return enviados.length > 0 ? `${icone.nome} · ainda não · ${enviados.join(" · ")}` : `${icone.nome} · ainda não`;
  }
  return enviados.length > 0 ? `${icone.nome} · ${enviados.join(" · ")}` : icone.nome;
}

export function ariaProgressoRegua(progresso: ProgressoRegua): string {
  const partes = progresso.icones.map((icone) => {
    const estado = progresso.neutra || !icone.aceso ? "apagado" : "aceso";
    return `${textoIcone(icone, progresso.neutra).replaceAll(" · ", ", ")}, ${estado}`;
  });
  return `Régua de cobrança. ${partes.join(". ")}`;
}

export function progressoDaFatura(entrada: {
  status: string;
  excluida: boolean;
  vencimento: string;
  hoje: string;
  modo?: ModoReguaCliente;
  reguaId?: string | null;
  reguas?: ReguaParaProgresso[];
  envios?: Pick<EnvioReguaLista, "passoId" | "canal" | "status">[];
}): ProgressoRegua {
  const tom = tomFatura(entrada.status, entrada.excluida);
  const neutra = tom === "cancelada" || tom === "estorno";
  const paga = tom === "paga";
  const fase = faseDaData(entrada.vencimento, entrada.hoje);
  const passos = passosAplicaveis(entrada.modo ?? "PADRAO", entrada.reguaId ?? null, entrada.reguas ?? []);
  const envios = entrada.envios ?? [];
  const aceso: Record<MarcoRegua, boolean> = {
    antes: !neutra,
    vencimento: !neutra && fase !== "antes",
    atraso: !neutra && fase === "atraso",
    pago: !neutra && paga,
  };

  const icones = (["antes", "vencimento", "atraso", "pago"] as const).map((id) => ({
    id,
    nome: NOMES[id],
    aceso: aceso[id],
    lembretes: id === "pago" ? [] : lembretesDoMomento(passos, envios, id),
  })) as ProgressoRegua["icones"];

  return { neutra, paga, icones };
}

function faseDaData(vencimento: string, hoje: string): MomentoEtapa {
  if (vencimento > hoje) return "antes";
  if (vencimento < hoje) return "atraso";
  return "vencimento";
}

function passosAplicaveis(
  modo: ModoReguaCliente,
  reguaId: string | null,
  reguas: ReguaParaProgresso[],
): PassoDaRegua[] {
  if (modo === "NENHUMA") return [];
  const regua = modo === "ESPECIFICA" ? reguas.find((item) => item.id === reguaId) : reguas.find((item) => item.padrao);
  if (!regua) return [];
  return [...regua.passos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

function lembretesDoMomento(
  passos: PassoDaRegua[],
  envios: Pick<EnvioReguaLista, "passoId" | "canal" | "status">[],
  momento: MomentoEtapa,
): LembreteMarco[] {
  const lista: LembreteMarco[] = [];
  for (const passo of passos) {
    if (momentoEtapaRegua(passo) !== momento) continue;
    const canais = canaisEnviados(envios, passo.id);
    if (canais.length === 0) continue;
    lista.push({ nome: nomeEtapaRegua(passo), canais });
  }
  return lista;
}

function canaisEnviados(
  envios: Pick<EnvioReguaLista, "passoId" | "canal" | "status">[],
  passoId: string,
): string[] {
  const vistos = new Set<string>();
  for (const envio of envios) {
    if (envio.passoId !== passoId || envio.status !== "ENVIADO") continue;
    const canal = envio.canal.trim();
    if (canal) vistos.add(canal);
  }
  const conhecidos = ORDEM_CANAL.filter((canal) => vistos.has(canal));
  const outros = [...vistos].filter((canal) => !ORDEM_CANAL.includes(canal)).sort((a, b) => a.localeCompare(b));
  return [...conhecidos, ...outros];
}

function rotuloCanais(canais: string[]): string {
  const nomes = canais.map(rotuloCanal);
  if (nomes.length === 0) return "e-mail";
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function rotuloCanal(canal: string): string {
  if (canal === "EMAIL") return "e-mail";
  if (canal === "WHATSAPP") return "WhatsApp";
  return canal;
}
