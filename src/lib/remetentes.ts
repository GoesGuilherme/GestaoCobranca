export const REMETENTE_AUTH_PADRAO = "Taguaro <noreply@taguaro.com.br>";
export const EMAIL_COBRANCA_PADRAO = "cobranca@taguaro.com.br";

export function emailDeCobranca(valor: string | null | undefined): string {
  const texto = valor?.trim() ?? "";
  return texto || EMAIL_COBRANCA_PADRAO;
}
