import { X509Certificate, createPrivateKey, createPublicKey } from "node:crypto";
import { ErroAplicacao } from "@/server/erros";

export function contaCorrenteInter(valor: string): string {
  const digitos = valor.replace(/\D/g, "").replace(/^0+/, "");
  if (!/^[1-9]\d{0,19}$/.test(digitos)) {
    throw new ErroAplicacao(
      "Informe a conta corrente só com números, incluindo o dígito e sem zeros à esquerda.",
      400,
      "conta_invalida",
    );
  }
  return digitos;
}

export function validarParCertificado(certificadoPem: string, chavePrivadaPem: string): Date {
  if (!certificadoPem.includes("BEGIN CERTIFICATE")) {
    throw new ErroAplicacao(
      "Envie o certificado .crt baixado no Internet Banking do Inter.",
      400,
      "certificado_invalido",
    );
  }
  if (!/BEGIN (?:RSA |EC )?PRIVATE KEY/.test(chavePrivadaPem)) {
    throw new ErroAplicacao("Envie a chave privada .key que o Inter gerou junto com o certificado.", 400, "chave_invalida");
  }
  let certificado: X509Certificate;
  try {
    certificado = new X509Certificate(certificadoPem);
  } catch {
    throw new ErroAplicacao("O certificado do Inter não pôde ser lido.", 400, "certificado_invalido");
  }
  let publicaChave;
  try {
    publicaChave = createPublicKey(createPrivateKey(chavePrivadaPem));
  } catch {
    throw new ErroAplicacao("A chave privada do Inter não pôde ser lida.", 400, "chave_invalida");
  }
  const publicaCertificado = createPublicKey(certificado.publicKey);
  if (!publicaCertificado.equals(publicaChave)) {
    throw new ErroAplicacao("O certificado e a chave privada não formam um par.", 400, "certificado_invalido");
  }
  const validade = new Date(certificado.validTo);
  if (Number.isNaN(validade.getTime())) {
    throw new ErroAplicacao("O certificado do Inter não tem data de validade.", 400, "certificado_invalido");
  }
  return validade;
}

export const DIAS_AVISO_CERTIFICADO = 30;

export function certificadoPertoDoVencimento(validade: Date, agora = new Date()): boolean {
  const limite = agora.getTime() + DIAS_AVISO_CERTIFICADO * 24 * 60 * 60 * 1000;
  return validade.getTime() <= limite;
}
