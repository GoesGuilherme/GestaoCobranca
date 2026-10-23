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

function centavosComSinal(texto: string): bigint | null {
  const limpo = texto.trim();
  const negativo = limpo.startsWith("-");
  const centavos = centavosDeTexto(negativo ? limpo.slice(1) : limpo);
  if (centavos === null) return null;
  return negativo ? -centavos : centavos;
}

function textoComSinal(centavos: bigint): string {
  const negativo = centavos < BigInt(0);
  const texto = textoDeCentavos(negativo ? -centavos : centavos);
  return negativo ? `-${texto}` : texto;
}

// Imposto = preço × alíquota, arredondado meio centavo para cima. Sem alíquota, é zero.
function impostoEmCentavos(precoCentavos: bigint, aliquota: string | null): bigint | null {
  if (aliquota === null) return BigInt(0);
  const pontos = centavosDeTexto(aliquota);
  if (pontos === null || pontos > ALIQUOTA_MAX) return null;
  return (precoCentavos * pontos + BigInt(5000)) / BigInt(10000);
}

export function calcularImposto(preco: string, aliquota: string | null): string | null {
  const precoCentavos = centavosDeTexto(preco);
  if (precoCentavos === null) return null;
  const imposto = impostoEmCentavos(precoCentavos, aliquota);
  if (imposto === null) return null;
  return textoDeCentavos(imposto);
}

// Margem financeira = preço − custo (zero se vazio) − imposto (zero se vazio). Sempre numérica.
export function margemFinanceira(preco: string, custo: string | null, aliquota: string | null): string | null {
  const precoCentavos = centavosDeTexto(preco);
  if (precoCentavos === null) return null;
  const custoCentavos = custo === null ? BigInt(0) : centavosDeTexto(custo);
  if (custoCentavos === null) return null;
  const imposto = impostoEmCentavos(precoCentavos, aliquota);
  if (imposto === null) return null;
  return textoComSinal(precoCentavos - custoCentavos - imposto);
}

// Margem do catálogo e da ficha. Custo ou alíquota ausentes contam como zero.
// Se os dois faltam, não há margem para mostrar: repetir o preço não ajuda.
export function calcularMargem(preco: string, custo: string | null, aliquota: string | null): string | null {
  if (custo === null && aliquota === null) return null;
  return margemFinanceira(preco, custo, aliquota);
}

export function somarDinheiroAssinado(valores: string[]): string {
  let centavos = BigInt(0);
  for (const valor of valores) {
    const parte = centavosComSinal(valor);
    if (parte === null) {
      throw new Error("Valor monetário inválido na soma.");
    }
    centavos += parte;
  }
  return textoComSinal(centavos);
}

export function compararDinheiro(a: string, b: string): number {
  const centavosA = centavosComSinal(a);
  const centavosB = centavosComSinal(b);
  if (centavosA === null || centavosB === null || centavosA === centavosB) return 0;
  return centavosA > centavosB ? 1 : -1;
}

// Percentual com duas casas. Parte pode ser negativa. Total zero não tem percentual.
export function percentualSobre(parte: string, total: string): string | null {
  const numerador = centavosComSinal(parte);
  const divisor = centavosComSinal(total);
  if (numerador === null || divisor === null || divisor === BigInt(0)) return null;
  const produto = numerador * BigInt(10000);
  const negativo = produto < BigInt(0);
  const absoluto = negativo ? -produto : produto;
  let quociente = absoluto / divisor;
  const resto = absoluto % divisor;
  if (resto * BigInt(2) >= divisor) quociente += BigInt(1);
  const pontos = negativo ? -quociente : quociente;
  const sinal = pontos < BigInt(0);
  const valor = sinal ? -pontos : pontos;
  const inteiro = valor / CEM;
  const frac = (valor % CEM).toString().padStart(2, "0");
  return sinal ? `-${inteiro}.${frac}` : `${inteiro}.${frac}`;
}

export function formatarPercentual(texto: string): string {
  const negativo = texto.trim().startsWith("-");
  const normal = normalizarDinheiro(negativo ? texto.trim().slice(1) : texto);
  if (!normal) return "";
  const [inteiro, frac] = normal.split(".");
  const corpo = frac === "00" ? `${inteiro}%` : `${inteiro},${frac}%`;
  return negativo ? `-${corpo}` : corpo;
}
