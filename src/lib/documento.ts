export type TipoDocumento = "CPF" | "CNPJ";

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function somenteDocumento(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function valorCaractere(caractere: string): number {
  return caractere.charCodeAt(0) - 48;
}

function digitoMod11(soma: number): number {
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = somenteDocumento(valor);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const numeros = cpf.split("").map(Number);
  let soma = 0;
  for (let indice = 0; indice < 9; indice += 1) {
    soma += numeros[indice] * (10 - indice);
  }
  let digito1 = (soma * 10) % 11;
  if (digito1 === 10) digito1 = 0;
  if (digito1 !== numeros[9]) return false;

  soma = 0;
  for (let indice = 0; indice < 10; indice += 1) {
    soma += numeros[indice] * (11 - indice);
  }
  let digito2 = (soma * 10) % 11;
  if (digito2 === 10) digito2 = 0;
  return digito2 === numeros[10];
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDocumento(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const valores = cnpj.split("").map(valorCaractere);
  const digito1 = digitoMod11(
    PESOS_CNPJ_1.reduce((soma, peso, indice) => soma + valores[indice] * peso, 0),
  );
  if (digito1 !== valores[12]) return false;

  const comPrimeiro = [...valores.slice(0, 12), digito1];
  const digito2 = digitoMod11(
    PESOS_CNPJ_2.reduce((soma, peso, indice) => soma + comPrimeiro[indice] * peso, 0),
  );
  return digito2 === valores[13];
}

export function identificarDocumento(
  valor: string,
): { tipo: TipoDocumento; normalizado: string } | null {
  const limpo = somenteDocumento(valor);
  if (limpo.length === 11 && cpfValido(limpo)) {
    return { tipo: "CPF", normalizado: limpo };
  }
  if (limpo.length === 14 && cnpjValido(limpo)) {
    return { tipo: "CNPJ", normalizado: limpo };
  }
  return null;
}

export function formatarCpf(valor: string): string {
  const digitos = somenteDocumento(valor);
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarCnpj(valor: string): string {
  const documento = somenteDocumento(valor);
  return documento.replace(
    /^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function formatarDocumento(valor: string, tipo?: TipoDocumento): string {
  const limpo = somenteDocumento(valor);
  if (tipo === "CPF" || (!tipo && limpo.length <= 11)) return formatarCpf(limpo);
  return formatarCnpj(limpo);
}

export function completarCpf(raiz: string): string {
  const base = raiz.replace(/\D/g, "");
  if (!/^\d{9}$/.test(base)) {
    throw new Error("A raiz do CPF precisa ter 9 dígitos.");
  }
  const numeros = base.split("").map(Number);
  let soma = 0;
  for (let indice = 0; indice < 9; indice += 1) {
    soma += numeros[indice] * (10 - indice);
  }
  let digito1 = (soma * 10) % 11;
  if (digito1 === 10) digito1 = 0;
  soma = 0;
  const comPrimeiro = [...numeros, digito1];
  for (let indice = 0; indice < 10; indice += 1) {
    soma += comPrimeiro[indice] * (11 - indice);
  }
  let digito2 = (soma * 10) % 11;
  if (digito2 === 10) digito2 = 0;
  return `${base}${digito1}${digito2}`;
}

export function completarCnpj(raiz: string): string {
  const base = raiz.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{12}$/.test(base)) {
    throw new Error("A raiz do CNPJ precisa ter 12 caracteres.");
  }
  const valores = base.split("").map(valorCaractere);
  const digito1 = digitoMod11(
    PESOS_CNPJ_1.reduce((soma, peso, indice) => soma + valores[indice] * peso, 0),
  );
  const comPrimeiro = [...valores, digito1];
  const digito2 = digitoMod11(
    PESOS_CNPJ_2.reduce((soma, peso, indice) => soma + comPrimeiro[indice] * peso, 0),
  );
  return `${base}${digito1}${digito2}`;
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function whatsappValido(valor: string): boolean {
  const digitos = somenteDigitos(valor);
  return /^[1-9]{2}9?\d{8}$/.test(digitos) && (digitos.length === 10 || digitos.length === 11);
}

export function formatarWhatsapp(valor: string): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) {
    return digitos.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (digitos.length === 10) {
    return digitos.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return valor;
}
