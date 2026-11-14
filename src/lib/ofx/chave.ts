// Banco e conta entram na chave de idempotência. 0341 e 341 são o mesmo Itaú.
export function normalizarBankId(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  const semZeros = digitos.replace(/^0+/, "");
  const corpo = semZeros || "0";
  return corpo.length >= 3 ? corpo : corpo.padStart(3, "0");
}

export function normalizarAcctId(valor: string): string {
  return valor.replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
}

export function normalizarFitId(valor: string): string {
  return valor.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
}

export function referenciaOfx(credito: { bankId: string; acctId: string; fitId: string }): string {
  return `${credito.bankId}|${credito.acctId}|${credito.fitId}`.slice(0, 240);
}

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "077": "Inter",
  "104": "Caixa",
  "237": "Bradesco",
  "260": "Nubank",
  "341": "Itaú",
  "403": "Cora",
  "748": "Sicredi",
  "756": "Sicoob",
};

export function rotuloBanco(bankId: string): string {
  return BANCOS[normalizarBankId(bankId)] ?? `Banco ${normalizarBankId(bankId) || bankId}`;
}

export function mascaraConta(acctId: string): string {
  const digitos = acctId.replace(/\D/g, "");
  if (!digitos) return "conta";
  if (digitos.length <= 4) return digitos;
  return `····${digitos.slice(-4)}`;
}
