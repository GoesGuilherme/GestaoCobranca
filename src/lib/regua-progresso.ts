import { STATUS_PAGAS } from "./fatura-situacao";
import type { ModoReguaCliente } from "./tipos";

export type MomentoEtapa = "antes" | "vencimento" | "atraso";

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

export type EtapaRegua = {
  id: string;
  nome: string;
  momento: MomentoEtapa;
  enviada: boolean;
  canais: string[];
};

export type ProgressoRegua = {
  paga: boolean;
  encerrada: boolean;
  etapas: EtapaRegua[];
};

const ORDEM_CANAL = ["EMAIL", "WHATSAPP"];

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

export function textoEtapa(etapa: Pick<EtapaRegua, "nome" | "enviada" | "canais">): string {
  if (!etapa.enviada) return `${etapa.nome} · ainda não enviada`;
  return `${etapa.nome} · enviada por ${rotuloCanais(etapa.canais)}`;
}

export function ariaProgressoRegua(progresso: ProgressoRegua): string {
  const enviadas = progresso.etapas.filter((etapa) => etapa.enviada).length;
  const partes = progresso.etapas.map((etapa) => textoEtapa(etapa));
  if (progresso.paga) partes.push("Fatura paga");
  else if (progresso.encerrada) partes.push("Régua encerrada");
  return `Régua de cobrança, ${enviadas} de ${progresso.etapas.length} etapas enviadas. ${partes.join(". ")}`;
}

export function progressoDaFatura(entrada: {
  status: string;
  excluida: boolean;
  modo: ModoReguaCliente;
  reguaId: string | null;
  reguas: ReguaParaProgresso[];
  envios: Pick<EnvioReguaLista, "passoId" | "canal" | "status">[];
}): ProgressoRegua | null {
  const passos = passosAplicaveis(entrada.modo, entrada.reguaId, entrada.reguas);
  if (!passos || passos.length === 0) return null;
  const paga = !entrada.excluida && STATUS_PAGAS.some((status) => status === entrada.status);
  return {
    paga,
    encerrada: paga || entrada.excluida,
    etapas: ordenarPassos(passos).map((passo) => {
      const canais = canaisEnviados(entrada.envios, passo.id);
      return {
        id: passo.id,
        nome: nomeEtapaRegua(passo),
        momento: momentoEtapaRegua(passo),
        enviada: canais.length > 0,
        canais,
      };
    }),
  };
}

function passosAplicaveis(
  modo: ModoReguaCliente,
  reguaId: string | null,
  reguas: ReguaParaProgresso[],
): PassoDaRegua[] | null {
  if (modo === "NENHUMA") return null;
  const regua = modo === "ESPECIFICA" ? reguas.find((item) => item.id === reguaId) : reguas.find((item) => item.padrao);
  if (!regua || regua.passos.length === 0) return null;
  return regua.passos;
}

function ordenarPassos(passos: PassoDaRegua[]): PassoDaRegua[] {
  return passos
    .map((passo, indice) => ({ passo, indice, ordem: passo.ordem ?? indice }))
    .sort((a, b) => a.ordem - b.ordem || a.indice - b.indice)
    .map((item) => item.passo);
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
