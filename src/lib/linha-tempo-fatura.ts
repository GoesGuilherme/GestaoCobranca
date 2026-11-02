import { dataIsoValida } from "./data";
import { tomFatura } from "./fatura-situacao";
import { formatarData, formatarDataIso } from "./formatacao";
import { somarDias } from "./regua";
import type { EnvioReguaLista, PassoDaRegua, ReguaParaProgresso } from "./regua-progresso";
import type { ModoReguaCliente } from "./tipos";
import {
  marcadoresDaLinhaTempo,
  nomeAcaoLinhaTempo,
  textoQuandoMarcador,
  type CanalMarcador,
  type FaseLinhaTempo,
  type PassoLinhaTempo,
} from "./linha-tempo-regua";

export type MarcoFatura = {
  chave: string;
  fase: FaseLinhaTempo;
  texto: string;
  aceso: boolean;
  canais: CanalMarcador[];
  dica: string;
  titulo: string;
  detalhe: string | null;
};

export type LinhaDoTempoFatura = {
  neutra: boolean;
  paga: boolean;
  semRegua: boolean;
  marcadores: MarcoFatura[];
};

type EntradaLinhaFatura = {
  status: string;
  excluida: boolean;
  vencimento: string;
  hoje: string;
  modo?: ModoReguaCliente;
  reguaId?: string | null;
  reguas?: ReguaParaProgresso[];
  envios?: Pick<EnvioReguaLista, "passoId" | "canal" | "status" | "criadoEm">[];
};

function reguaAplicavel(modo: ModoReguaCliente, reguaId: string | null, reguas: ReguaParaProgresso[]): ReguaParaProgresso | null {
  if (modo === "NENHUMA") return null;
  if (modo === "ESPECIFICA") return reguas.find((item) => item.id === reguaId) ?? null;
  return reguas.find((item) => item.padrao) ?? null;
}

function passoParaLinha(passo: PassoDaRegua): PassoLinhaTempo {
  return {
    id: passo.id,
    naEmissao: passo.naEmissao,
    dias: passo.dias,
    assunto: passo.assunto ?? "",
    enviarWhatsapp: passo.enviarWhatsapp === true,
  };
}

function canalDeEnvio(canal: string): CanalMarcador | null {
  const texto = canal.trim().toUpperCase();
  if (texto === "EMAIL") return "email";
  if (texto === "WHATSAPP") return "whatsapp";
  return null;
}

type EnvioEfetivo = {
  canal: CanalMarcador;
  enviadoEm: string | null;
};

function enviosPorPasso(envios: Pick<EnvioReguaLista, "passoId" | "canal" | "status" | "criadoEm">[]): Map<string, EnvioEfetivo[]> {
  const mapa = new Map<string, Map<CanalMarcador, string | null>>();
  for (const envio of envios) {
    if (envio.status !== "ENVIADO" || !envio.passoId) continue;
    const canal = canalDeEnvio(envio.canal);
    if (!canal) continue;
    const porCanal = mapa.get(envio.passoId) ?? new Map<CanalMarcador, string | null>();
    const quando = envio.criadoEm?.trim() ? envio.criadoEm : null;
    const atual = porCanal.get(canal);
    if (!porCanal.has(canal) || (quando && (!atual || quando > atual))) {
      porCanal.set(canal, quando);
    }
    mapa.set(envio.passoId, porCanal);
  }

  const resultado = new Map<string, EnvioEfetivo[]>();
  for (const [passoId, porCanal] of mapa) {
    const lista: EnvioEfetivo[] = [];
    for (const canal of ["email", "whatsapp"] as const) {
      if (!porCanal.has(canal)) continue;
      lista.push({ canal, enviadoEm: porCanal.get(canal) ?? null });
    }
    resultado.set(passoId, lista);
  }
  return resultado;
}

function horaDoEnvio(iso: string): string | null {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return formatarData(iso);
}

function detalheDoEnvio(envios: EnvioEfetivo[]): string | null {
  if (envios.length === 0) return null;
  return envios
    .map((envio) => {
      const hora = envio.enviadoEm ? horaDoEnvio(envio.enviadoEm) : null;
      return hora ? `${nomeCanal(envio.canal)} · ${hora}` : nomeCanal(envio.canal);
    })
    .join(" · ");
}

function dataPrevista(dias: number | null, vencimento: string): string | null {
  if (dias === null || !dataIsoValida(vencimento)) return null;
  return formatarDataIso(somarDias(vencimento, dias));
}

function tituloDaAcao(fase: FaseLinhaTempo, enviado: boolean, previsto: boolean): string {
  if (fase === "pago") return "Pago";
  if (fase === "emissao") return "Boleto emitido";
  if (fase === "antes") {
    if (enviado) return "Lembrete enviado";
    if (previsto) return "Lembrete previsto";
  }
  if (fase === "noDia") {
    if (enviado) return "Aviso enviado";
    if (previsto) return "Aviso previsto";
  }
  if (fase === "depois") {
    if (enviado) return "Cobrança enviada";
    if (previsto) return "Cobrança prevista";
  }
  return nomeAcaoLinhaTempo(fase);
}

function diaChegou(fase: FaseLinhaTempo, dias: number | null, vencimento: string, hoje: string): boolean {
  if (fase === "emissao") return true;
  if (fase === "pago" || dias === null) return false;
  return somarDias(vencimento, dias) <= hoje;
}

function nomeCanal(canal: CanalMarcador): string {
  return canal === "email" ? "E-mail" : "WhatsApp";
}

function textoCanais(canais: CanalMarcador[]): string {
  const nomes = canais.map(nomeCanal);
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0] ?? "";
  return `${nomes[0]} e ${nomes[1]}`;
}

function statusDoPasso(ocorrido: boolean, enviado: boolean, neutra: boolean): string {
  if (neutra) return "encerrada";
  if (enviado) return "enviado";
  if (ocorrido) return "não enviado";
  return "futuro";
}

function dicaDoPasso(fase: FaseLinhaTempo, dias: number | null, canais: CanalMarcador[], status: string): string {
  const quando = textoQuandoMarcador(fase, dias);
  const canal = textoCanais(canais);
  return canal ? `${quando} · ${canal} · ${status}` : `${quando} · ${status}`;
}

export function ariaLinhaDoTempoFatura(linha: LinhaDoTempoFatura): string {
  if (linha.semRegua) {
    if (linha.neutra) return "Sem régua. Cobrança encerrada.";
    if (linha.paga) return "Sem régua. Fatura paga.";
    return "Sem régua. Fatura em aberto.";
  }
  const partes = linha.marcadores.map((marco) => {
    const label = marco.detalhe ? `${marco.titulo}, ${marco.detalhe}` : marco.titulo;
    return `${label}. ${marco.dica}, ${marco.aceso ? "aceso" : "apagado"}`;
  });
  return `Régua de cobrança. ${partes.join(". ")}`;
}

/**
 * Marcos da régua que vale para a fatura, na ordem da linha do tempo.
 * Aceso quando o dia daquele passo já chegou ou o envio saiu.
 * O check de pago só acende com a fatura paga. Cancelada, estorno e sem régua ficam neutros.
 */
export function linhaDoTempoDaFatura(entrada: EntradaLinhaFatura): LinhaDoTempoFatura {
  const tom = tomFatura(entrada.status, entrada.excluida);
  const neutra = tom === "cancelada" || tom === "estorno";
  const paga = tom === "paga";
  const regua = reguaAplicavel(entrada.modo ?? "PADRAO", entrada.reguaId ?? null, entrada.reguas ?? []);
  const base = marcadoresDaLinhaTempo((regua?.passos ?? []).map(passoParaLinha));
  const semRegua = base.every((marco) => marco.fase === "pago");
  const enviados = enviosPorPasso(entrada.envios ?? []);

  const marcadores = base.map((marco) => {
    if (marco.fase === "pago") {
      const aceso = !neutra && paga;
      const status = neutra ? "encerrada" : paga ? "paga" : "em aberto";
      return {
        chave: marco.chave,
        fase: marco.fase,
        texto: marco.texto,
        aceso,
        canais: [],
        dica: `Pago · ${status}`,
        titulo: "Pago",
        detalhe: neutra ? "Encerrada" : null,
      };
    }
    const ocorrido = diaChegou(marco.fase, marco.dias, entrada.vencimento, entrada.hoje);
    const efetivos = marco.chave ? enviados.get(marco.chave) ?? [] : [];
    const enviado = efetivos.length > 0;
    const aceso = !neutra && (ocorrido || enviado);
    const previsto = !neutra && !ocorrido && !enviado;
    const titulo = tituloDaAcao(marco.fase, enviado, previsto);
    let detalhe: string | null = null;
    if (enviado) detalhe = detalheDoEnvio(efetivos);
    else if (neutra) detalhe = "Encerrada";
    else if (previsto) detalhe = dataPrevista(marco.dias, entrada.vencimento);
    else detalhe = "Não enviado";
    return {
      chave: marco.chave,
      fase: marco.fase,
      texto: marco.texto,
      aceso,
      canais: marco.canais,
      dica: dicaDoPasso(marco.fase, marco.dias, marco.canais, statusDoPasso(ocorrido, enviado, neutra)),
      titulo,
      detalhe,
    };
  });

  return { neutra, paga, semRegua, marcadores };
}
