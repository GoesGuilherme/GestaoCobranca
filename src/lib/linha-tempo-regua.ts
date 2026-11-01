import { inteiroDeCampo } from "./inteiro-campo";

/** Mesmo verde do check de pago (`--color-ok` em globals.css). */
export const VERDE_LINHA_TEMPO = "#146c43";

export type FaseLinhaTempo = "emissao" | "antes" | "noDia" | "depois" | "pago";

export type CanalMarcador = "email" | "whatsapp";

export type CoresFase = {
  marca: string;
  texto: string;
  apoio: string;
};

export const COR_FASE_LINHA_TEMPO: Record<FaseLinhaTempo, CoresFase> = {
  emissao: { marca: "#0E3A6B", texto: "#ffffff", apoio: "#0E3A6B" },
  antes: { marca: VERDE_LINHA_TEMPO, texto: "#ffffff", apoio: VERDE_LINHA_TEMPO },
  noDia: { marca: VERDE_LINHA_TEMPO, texto: "#ffffff", apoio: VERDE_LINHA_TEMPO },
  depois: { marca: "#D4A02C", texto: "#0E3A6B", apoio: "#7A5A10" },
  pago: { marca: VERDE_LINHA_TEMPO, texto: "#ffffff", apoio: VERDE_LINHA_TEMPO },
};

const ROTULO_FASE: Record<FaseLinhaTempo, string> = {
  emissao: "Emissão",
  antes: "Antes do vencimento",
  noDia: "No dia do vencimento",
  depois: "Depois do vencimento",
  pago: "Pago",
};

const ORDEM_FASE: Record<Exclude<FaseLinhaTempo, "pago">, number> = {
  emissao: 0,
  antes: 1,
  noDia: 2,
  depois: 3,
};

export type PassoLinhaTempo = {
  id?: string;
  naEmissao: boolean;
  dias: number | string | null;
  assunto: string;
  enviarWhatsapp: boolean;
};

export type MarcadorLinhaTempo = {
  chave: string;
  fase: FaseLinhaTempo;
  rotuloFase: string | null;
  texto: string;
  dias: number | null;
  canais: CanalMarcador[];
  assunto: string;
  dica: string;
  indice: number | null;
};

function diasDoPasso(passo: PassoLinhaTempo): number | null {
  if (passo.naEmissao) return null;
  if (typeof passo.dias === "number") {
    return Number.isSafeInteger(passo.dias) ? passo.dias : null;
  }
  if (passo.dias === null) return null;
  return inteiroDeCampo(passo.dias);
}

function faseDoPasso(passo: PassoLinhaTempo, dias: number | null): Exclude<FaseLinhaTempo, "pago"> | null {
  if (passo.naEmissao) return "emissao";
  if (dias === null) return null;
  if (dias < 0) return "antes";
  if (dias === 0) return "noDia";
  return "depois";
}

export function textoOffsetMarcador(fase: FaseLinhaTempo, dias: number | null): string {
  if (fase === "emissao") return "-";
  if (fase === "pago" || dias === null) return "";
  if (dias === 0) return "0";
  const absoluto = Math.abs(dias);
  return absoluto < 100 ? String(absoluto).padStart(2, "0") : String(absoluto);
}

export function textoQuandoMarcador(fase: FaseLinhaTempo, dias: number | null): string {
  if (fase === "emissao") return "Emissão do boleto";
  if (fase === "pago") return "Pago";
  if (dias === 0 || fase === "noDia") return "No dia do vencimento";
  const quantidade = Math.abs(dias ?? 0);
  const unidade = quantidade === 1 ? "dia" : "dias";
  if (fase === "antes") return `${quantidade} ${unidade} antes do vencimento`;
  return `${quantidade} ${unidade} depois do vencimento`;
}

function textoCanais(canais: CanalMarcador[]): string {
  const nomes = canais.map((canal) => (canal === "email" ? "E-mail" : "WhatsApp"));
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0] ?? "";
  return `${nomes[0]} e ${nomes[1]}`;
}

function dicaMarcador(fase: FaseLinhaTempo, dias: number | null, canais: CanalMarcador[], assunto: string): string {
  if (fase === "pago") return "Pago · quando o cliente paga a cobrança";
  const modelo = assunto.trim() || "Sem modelo";
  return `${textoQuandoMarcador(fase, dias)} · ${textoCanais(canais)} · ${modelo}`;
}

function canaisDoPasso(passo: PassoLinhaTempo): CanalMarcador[] {
  const canais: CanalMarcador[] = ["email"];
  if (passo.enviarWhatsapp) canais.push("whatsapp");
  return canais;
}

function marcadorPago(): MarcadorLinhaTempo {
  return {
    chave: "pago",
    fase: "pago",
    rotuloFase: ROTULO_FASE.pago,
    texto: "",
    dias: null,
    canais: [],
    assunto: "",
    dica: dicaMarcador("pago", null, [], ""),
    indice: null,
  };
}

/**
 * Monta os marcos da esquerda para a direita a partir dos passos reais.
 * Emissão, depois os dias antes, o dia do vencimento e os dias depois.
 * O marco Pago não vem do cadastro: fecha a linha quando o cliente quita.
 * Passo sem dia inteiro (rascunho ainda incompleto) fica de fora.
 */
export function marcadoresDaLinhaTempo(passos: PassoLinhaTempo[]): MarcadorLinhaTempo[] {
  const preparados: Array<{
    passo: PassoLinhaTempo;
    indice: number;
    fase: Exclude<FaseLinhaTempo, "pago">;
    dias: number | null;
  }> = [];

  passos.forEach((passo, indice) => {
    const dias = diasDoPasso(passo);
    const fase = faseDoPasso(passo, dias);
    if (!fase) return;
    preparados.push({ passo, indice, fase, dias });
  });

  preparados.sort((a, b) => {
    const porFase = ORDEM_FASE[a.fase] - ORDEM_FASE[b.fase];
    if (porFase !== 0) return porFase;
    const diaA = a.fase === "emissao" ? 0 : (a.dias ?? 0);
    const diaB = b.fase === "emissao" ? 0 : (b.dias ?? 0);
    if (diaA !== diaB) return diaA - diaB;
    return a.indice - b.indice;
  });

  let faseAnterior: FaseLinhaTempo | null = null;
  const marcadores = preparados.map(({ passo, indice, fase, dias }) => {
    const canais = canaisDoPasso(passo);
    const marcador: MarcadorLinhaTempo = {
      chave: passo.id ?? `passo-${indice}`,
      fase,
      rotuloFase: fase === faseAnterior ? null : ROTULO_FASE[fase],
      texto: textoOffsetMarcador(fase, dias),
      dias: fase === "emissao" ? null : dias,
      canais,
      assunto: passo.assunto,
      dica: dicaMarcador(fase, dias, canais, passo.assunto),
      indice,
    };
    faseAnterior = fase;
    return marcador;
  });

  return [...marcadores, marcadorPago()];
}
