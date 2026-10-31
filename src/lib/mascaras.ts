// Máscaras só de exibição. A validação continua aceitando o texto com ou sem pontuação.

export function mascararTelefoneDigitando(valor: string): string {
  const texto = valor.trimStart();
  if (texto.startsWith("+")) {
    return `+${texto.slice(1).replace(/[^\d\s()-]/g, "").replace(/\s+/g, " ").slice(0, 18)}`;
  }
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

function pontuarCpf(digitos: string): string {
  return digitos
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function pontuarCnpj(documento: string): string {
  return documento
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3")
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, ".$1/$2")
    .replace(/([0-9A-Z]{4})(\d{1,2})$/, "$1-$2");
}

export function mascararCnpjDigitando(valor: string): string {
  const documento = valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
  return pontuarCnpj(documento);
}

export function mascararDocumentoDigitando(valor: string): string {
  const documento = valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
  const soDigitos = /^\d*$/.test(documento);
  if (soDigitos && documento.length <= 11) return pontuarCpf(documento);
  return pontuarCnpj(documento);
}

function agruparReais(inteiroBruto: string, frac: string | null): string {
  const inteiroLimpo = inteiroBruto.replace(/^0+(?=\d)/, "");
  const inteiro = inteiroLimpo || (frac !== null ? "0" : "");
  if (!inteiro && frac === null) return "";
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (frac === null) return milhar;
  return `${milhar || "0"},${frac}`;
}

// Mantém a vírgula decimal e agrupa os milhares. "189,90" continua "189,90".
// "189.90" (ponto decimal) vira "189,90". "1.899" continua milhar.
export function mascararMoedaDigitando(valor: string): string {
  const semSimbolo = valor.trim().replace(/^R\$/i, "").replace(/\s/g, "");
  if (!semSimbolo) return "";

  if (semSimbolo.includes(",")) {
    const limpo = semSimbolo.replace(/\./g, "").replace(/[^\d,]/g, "");
    const [bruto, ...resto] = limpo.split(",");
    const frac = resto.join("").replace(/\D/g, "").slice(0, 2);
    return agruparReais(bruto, frac);
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(semSimbolo)) {
    return agruparReais(semSimbolo.replace(/\./g, ""), null);
  }

  const decimal = /^(\d+)\.(\d{1,2})$/.exec(semSimbolo);
  if (decimal) return agruparReais(decimal[1], decimal[2]);

  return agruparReais(semSimbolo.replace(/\D/g, ""), null);
}
