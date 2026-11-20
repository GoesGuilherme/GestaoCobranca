import { dataIsoValida } from "./data";
import { normalizarDinheiro } from "./dinheiro";
import { somenteDocumento } from "./documento";
import { statusNormalizado, STATUS_NORMALIZADO, type ProvedorCodigo } from "./status-pagamento";

export const TEXTO_COMPROVANTE_RECEBIDO =
  "Recebemos seu comprovante, vamos conferir e confirmar em breve.";

export const JANELA_COMPROVANTE_MS = 24 * 60 * 60 * 1000;

export const ROTULO_COMPROVANTE_PENDENTE = "Comprovante recebido — aguardando conferência";

export const ALERTAS_COMPROVANTE = [
  "recebedor_divergente",
  "e2e_duplicado",
  "comprovante_reutilizado",
  "valor_divergente",
  "data_anterior_a_fatura",
] as const;

export type AlertaComprovante = (typeof ALERTAS_COMPROVANTE)[number];

export type ExtracaoComprovante = {
  parece: boolean;
  valor: string | null;
  pagoEm: string | null;
  hora: string | null;
  pagador: string | null;
  recebedorNome: string | null;
  recebedorDocumento: string | null;
  recebedorChave: string | null;
  e2e: string | null;
};

export const EXTRACAO_VAZIA: ExtracaoComprovante = {
  parece: false,
  valor: null,
  pagoEm: null,
  hora: null,
  pagador: null,
  recebedorNome: null,
  recebedorDocumento: null,
  recebedorChave: null,
  e2e: null,
};

const ROTULOS_ALERTA: Record<AlertaComprovante, string> = {
  recebedor_divergente: "O recebedor não bate com o nome, o CNPJ ou a chave Pix da empresa.",
  e2e_duplicado: "Este ID da transação já apareceu em outro comprovante.",
  comprovante_reutilizado: "Este arquivo já foi usado em outro comprovante.",
  valor_divergente: "O valor do comprovante é diferente do valor da fatura.",
  data_anterior_a_fatura: "A data do comprovante é anterior à emissão da fatura.",
};

export function rotuloAlertaComprovante(alerta: string): string {
  if ((ALERTAS_COMPROVANTE as readonly string[]).includes(alerta)) {
    return ROTULOS_ALERTA[alerta as AlertaComprovante];
  }
  return alerta;
}

export function dentroDaJanelaComprovante(recebidoEm: Date, agora: Date): boolean {
  const delta = agora.getTime() - recebidoEm.getTime();
  return delta >= 0 && delta <= JANELA_COMPROVANTE_MS;
}

export function modeloComprovante(env: NodeJS.ProcessEnv = process.env): string {
  const informado = env.AI_COMPROVANTE_MODEL?.trim() || env.AI_WHATSAPP_MODEL?.trim() || "";
  if (informado.includes("/") && informado.length <= 120) return informado;
  return "spacexai/grok-4.20-non-reasoning";
}

function semAcento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nomesParecem(a: string, b: string): boolean {
  const esquerda = semAcento(a);
  const direita = semAcento(b);
  if (!esquerda || !direita) return false;
  return esquerda.includes(direita) || direita.includes(esquerda);
}

export function recebedorConfere(
  extraido: Pick<ExtracaoComprovante, "recebedorNome" | "recebedorDocumento" | "recebedorChave">,
  empresa: { nomeFantasia: string; razaoSocial: string; cnpj: string; chavePix: string | null },
): boolean {
  const documento = somenteDocumento(extraido.recebedorDocumento ?? "");
  const cnpj = somenteDocumento(empresa.cnpj);
  if (documento && cnpj && documento === cnpj) return true;
  const chaveExtraida = (extraido.recebedorChave ?? "").trim().toLocaleLowerCase("pt-BR");
  const chaveEmpresa = (empresa.chavePix ?? "").trim().toLocaleLowerCase("pt-BR");
  if (chaveExtraida && chaveEmpresa && (chaveExtraida === chaveEmpresa || somenteDocumento(chaveExtraida) === somenteDocumento(chaveEmpresa))) {
    return true;
  }
  if (extraido.recebedorNome && (nomesParecem(extraido.recebedorNome, empresa.nomeFantasia) || nomesParecem(extraido.recebedorNome, empresa.razaoSocial))) {
    return true;
  }
  const informou = Boolean(extraido.recebedorNome || documento || chaveExtraida);
  return !informou;
}

export type FaturaParaComprovante = {
  id: string;
  valor: string;
  vencimento: string;
  criadoEm: string;
  status: string;
  excluida: boolean;
  provedor: ProvedorCodigo | string;
};

export function faturaAbertaParaComprovante(fatura: FaturaParaComprovante): boolean {
  if (fatura.excluida) return false;
  const normalizado = statusNormalizado(fatura.status, fatura.provedor as ProvedorCodigo);
  return normalizado === STATUS_NORMALIZADO.PENDENTE || normalizado === STATUS_NORMALIZADO.VENCIDO;
}

function distanciaDias(isoA: string, isoB: string): number {
  const a = Date.parse(`${isoA}T00:00:00.000Z`);
  const b = Date.parse(`${isoB}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.abs(Math.round((a - b) / 86_400_000));
}

export function escolherFaturaDoComprovante(
  faturas: FaturaParaComprovante[],
  extraido: Pick<ExtracaoComprovante, "valor" | "pagoEm">,
): { faturaId: string | null; valorDiverge: boolean } {
  const abertas = faturas.filter(faturaAbertaParaComprovante);
  if (abertas.length === 0) return { faturaId: null, valorDiverge: false };
  const valor = normalizarDinheiro(extraido.valor ?? "");
  const iguais = valor ? abertas.filter((fatura) => normalizarDinheiro(fatura.valor) === valor) : [];
  const referencia = extraido.pagoEm && dataIsoValida(extraido.pagoEm) ? extraido.pagoEm : null;
  const ordenar = (lista: FaturaParaComprovante[]) =>
    [...lista].sort((a, b) => {
      if (!referencia) return a.vencimento.localeCompare(b.vencimento);
      return distanciaDias(a.vencimento, referencia) - distanciaDias(b.vencimento, referencia);
    });
  if (iguais.length > 0) return { faturaId: ordenar(iguais)[0]?.id ?? null, valorDiverge: false };
  if (abertas.length === 1) return { faturaId: abertas[0]?.id ?? null, valorDiverge: true };
  return { faturaId: null, valorDiverge: true };
}

export function alertasDoComprovante(dados: {
  extraido: ExtracaoComprovante;
  empresa: { nomeFantasia: string; razaoSocial: string; cnpj: string; chavePix: string | null };
  fatura: { valor: string; criadoEm: string } | null;
  valorDiverge: boolean;
  e2eDuplicado: boolean;
  hashUsado: boolean;
}): AlertaComprovante[] {
  const alertas: AlertaComprovante[] = [];
  if (!recebedorConfere(dados.extraido, dados.empresa)) alertas.push("recebedor_divergente");
  if (dados.e2eDuplicado) alertas.push("e2e_duplicado");
  if (dados.hashUsado) alertas.push("comprovante_reutilizado");
  if (dados.valorDiverge || (dados.fatura && dados.extraido.valor && normalizarDinheiro(dados.extraido.valor) !== normalizarDinheiro(dados.fatura.valor))) {
    alertas.push("valor_divergente");
  }
  if (dados.fatura && dados.extraido.pagoEm && dataIsoValida(dados.extraido.pagoEm)) {
    const emissao = dados.fatura.criadoEm.slice(0, 10);
    if (dataIsoValida(emissao) && dados.extraido.pagoEm < emissao) alertas.push("data_anterior_a_fatura");
  }
  return alertas;
}
