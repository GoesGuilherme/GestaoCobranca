const CEM = BigInt(100);
const CENTAVOS_MAX = BigInt("999999999999");

function textoDeCentavos(centavos: bigint): string {
  const inteiro = centavos / CEM;
  const frac = (centavos % CEM).toString().padStart(2, "0");
  return `${inteiro}.${frac}`;
}

function centavosDeTexto(texto: string): bigint | null {
  const limpo = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!limpo || !/^[\d.,]+$/.test(limpo)) return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let separador: "," | "." | null = null;

  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    separador = ultimaVirgula > ultimoPonto ? "," : ".";
  } else if (ultimaVirgula >= 0) {
    separador = ",";
  } else if (ultimoPonto >= 0) {
    const casas = limpo.length - ultimoPonto - 1;
    if (casas === 1 || casas === 2) separador = ".";
    else if (casas !== 3) return null;
  }

  let inteiro: string;
  let frac = "";
  if (separador) {
    const indice = limpo.lastIndexOf(separador);
    inteiro = limpo.slice(0, indice).replace(/[.,]/g, "");
    frac = limpo.slice(indice + 1);
    if (frac.length > 2 || !/^\d+$/.test(frac)) return null;
  } else {
    inteiro = limpo.replace(/\./g, "");
  }

  if (inteiro === "") inteiro = "0";
  if (!/^\d+$/.test(inteiro)) return null;

  const centavos = BigInt(inteiro) * CEM + BigInt((frac + "00").slice(0, 2));
  if (centavos > CENTAVOS_MAX) return null;
  return centavos;
}

export function normalizarDinheiro(entrada: unknown): string | null {
  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) return null;
    const centavos = centavosDeTexto(entrada.toFixed(2));
    if (centavos === null) return null;
    return textoDeCentavos(centavos);
  }
  if (typeof entrada !== "string") return null;
  const centavos = centavosDeTexto(entrada);
  if (centavos === null) return null;
  return textoDeCentavos(centavos);
}

export function somarDinheiro(valores: string[]): string {
  let centavos = BigInt(0);
  for (const valor of valores) {
    const normal = normalizarDinheiro(valor);
    if (normal === null) {
      throw new Error("Valor monetário inválido na soma.");
    }
    const [inteiro, frac] = normal.split(".");
    centavos += BigInt(inteiro) * CEM + BigInt(frac);
  }
  return textoDeCentavos(centavos);
}

export function formatarReais(texto: string): string {
  const normal = normalizarDinheiro(texto) ?? "0.00";
  const [inteiro, frac] = normal.split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${comMilhar},${frac}`;
}

export function formatarValorCampo(texto: string): string {
  const normal = normalizarDinheiro(texto);
  if (!normal) return "";
  const [inteiro, frac] = normal.split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${comMilhar},${frac}`;
}

export function formatarReaisAssinado(texto: string): string {
  if (texto.startsWith("-")) return `-${formatarReais(texto.slice(1))}`;
  return formatarReais(texto);
}

const ALIQUOTA_MAX = BigInt(10000);

export function normalizarAliquota(entrada: unknown): string | null {
  const tratado = typeof entrada === "string" ? entrada.trim().replace(/\s/g, "").replace(/%$/, "") : entrada;
  const normal = normalizarDinheiro(tratado);
  if (normal === null) return null;
  const centavos = centavosDeTexto(normal);
  if (centavos === null || centavos > ALIQUOTA_MAX) return null;
  return normal;
}

export function formatarAliquota(texto: string): string {
  const normal = normalizarAliquota(texto);
  if (!normal) return "";
  const [inteiro, frac] = normal.split(".");
  if (frac === "00") return `${inteiro}%`;
  return `${inteiro},${frac}%`;
}

export function formatarAliquotaCampo(texto: string): string {
  const normal = normalizarAliquota(texto);
  if (!normal) return "";
  const [inteiro, frac] = normal.split(".");
  return `${inteiro},${frac}`;
}

// Margem = preço − custo − (preço × alíquota). Custo ou alíquota ausentes contam como zero.
// Se os dois faltam, não há margem para mostrar. O imposto arredonda meio centavo para cima.
export function calcularMargem(preco: string, custo: string | null, aliquota: string | null): string | null {
  if (custo === null && aliquota === null) return null;
  const precoCentavos = centavosDeTexto(preco);
  if (precoCentavos === null) return null;
  const custoCentavos = custo === null ? BigInt(0) : centavosDeTexto(custo);
  if (custoCentavos === null) return null;

  let imposto = BigInt(0);
  if (aliquota !== null) {
    const pontos = centavosDeTexto(aliquota);
    if (pontos === null || pontos > ALIQUOTA_MAX) return null;
    imposto = (precoCentavos * pontos + BigInt(5000)) / BigInt(10000);
  }

  const margem = precoCentavos - custoCentavos - imposto;
  const negativo = margem < BigInt(0);
  const absoluto = negativo ? -margem : margem;
  const texto = textoDeCentavos(absoluto);
  return negativo ? `-${texto}` : texto;
}
