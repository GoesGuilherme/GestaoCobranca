/** Texto aceito enquanto a pessoa digita um inteiro com sinal. */
export function textoInteiroPermitido(texto: string): boolean {
  return /^-?\d*$/.test(texto);
}

/** Hora de 0 a 23: só dígitos, no máximo dois, sem sinal. */
export function textoHoraPermitido(texto: string): boolean {
  return /^\d{0,2}$/.test(texto);
}

/**
 * Inteiro só quando o texto está completo.
 * Vazio e "-" ainda não são número — não viram NaN.
 */
export function inteiroDeCampo(texto: string): number | null {
  const limpo = texto.trim();
  if (!/^-?\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  if (!Number.isSafeInteger(valor)) return null;
  return valor === 0 ? 0 : valor;
}
