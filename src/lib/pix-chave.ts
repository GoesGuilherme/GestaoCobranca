import { cnpjValido, cpfValido, somenteDocumento } from "./documento";

export const TIPOS_CHAVE_PIX = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "EVP"] as const;

export type TipoChavePix = (typeof TIPOS_CHAVE_PIX)[number];

export type ChavePixNormalizada =
  | { ok: true; tipo: TipoChavePix; chave: string }
  | { ok: false; erro: string };

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function tipoChavePix(valor: string): TipoChavePix | null {
  return (TIPOS_CHAVE_PIX as readonly string[]).includes(valor) ? (valor as TipoChavePix) : null;
}

export function normalizarChavePix(tipo: string, valor: string): ChavePixNormalizada {
  const escolhido = tipoChavePix(tipo);
  if (!escolhido) return { ok: false, erro: "Escolha o tipo da chave Pix." };
  if (escolhido === "CPF") return normalizarCpf(valor);
  if (escolhido === "CNPJ") return normalizarCnpj(valor);
  if (escolhido === "EMAIL") return normalizarEmail(valor);
  if (escolhido === "TELEFONE") return normalizarTelefone(valor);
  return normalizarEvp(valor);
}

function normalizarCpf(valor: string): ChavePixNormalizada {
  const digitos = valor.replace(/\D/g, "");
  if (!cpfValido(digitos)) return { ok: false, erro: "CPF da chave Pix inválido." };
  return { ok: true, tipo: "CPF", chave: digitos };
}

function normalizarCnpj(valor: string): ChavePixNormalizada {
  const chave = somenteDocumento(valor);
  if (!cnpjValido(chave)) return { ok: false, erro: "CNPJ da chave Pix inválido." };
  return { ok: true, tipo: "CNPJ", chave };
}

function normalizarEmail(valor: string): ChavePixNormalizada {
  const email = valor.trim().toLowerCase();
  if (email.length > 77 || !EMAIL.test(email)) return { ok: false, erro: "E-mail da chave Pix inválido." };
  return { ok: true, tipo: "EMAIL", chave: email };
}

function normalizarTelefone(valor: string): ChavePixNormalizada {
  const digitos = valor.replace(/\D/g, "");
  let nacional = digitos;
  if (nacional.startsWith("55") && (nacional.length === 12 || nacional.length === 13)) {
    nacional = nacional.slice(2);
  }
  if (!/^[1-9]\d{9,10}$/.test(nacional)) {
    return { ok: false, erro: "Telefone da chave Pix inválido. Use DDD e número." };
  }
  return { ok: true, tipo: "TELEFONE", chave: `+55${nacional}` };
}

function normalizarEvp(valor: string): ChavePixNormalizada {
  const chave = valor.trim().toLowerCase();
  if (!EVP.test(chave)) return { ok: false, erro: "Chave aleatória inválida. Use o UUID gerado pelo banco." };
  return { ok: true, tipo: "EVP", chave };
}

export const PIX_VAZIO = {
  tipoChave: "CNPJ" as const,
  chavePix: "",
  nomeRecebedor: "",
  cidadeRecebedor: "",
  usarNasCobrancas: false,
};

export type RascunhoPix = {
  tipoChave: string;
  chavePix: string;
  nomeRecebedor: string;
  cidadeRecebedor: string;
  usarNasCobrancas: boolean;
};
