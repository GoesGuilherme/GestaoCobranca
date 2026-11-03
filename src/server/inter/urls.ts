import type { AmbientePagamento } from "@/server/pagamentos/credenciais";

const PRODUCAO = "https://cdpj.partners.bancointer.com.br";
const SANDBOX = "https://cdpj-sandbox.partners.uatinter.co";

export function origemInter(ambiente: AmbientePagamento): string {
  return ambiente === "PRODUCAO" ? PRODUCAO : SANDBOX;
}

export function urlTokenInter(ambiente: AmbientePagamento): string {
  return `${origemInter(ambiente)}/oauth/v2/token`;
}

export function urlCobrancasInter(ambiente: AmbientePagamento): string {
  return `${origemInter(ambiente)}/cobranca/v3/cobrancas`;
}
