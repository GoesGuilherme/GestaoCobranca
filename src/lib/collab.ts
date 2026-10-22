// Mantido igual ao INSERT da migration 20261021235900_multiempresa.
// O CNPJ não passa na validação de propósito: a Collab troca esse valor na tela Empresa.

export const ID_EMPRESA_COLLAB = "collab_software";
export const CNPJ_COLLAB_PENDENTE = "00000000000000";
export const EMAIL_SUPERADMIN_INICIAL = "guilherme.goes@collabsoftware.com.br";

export function cnpjCollabPendente(cnpj: string): boolean {
  return cnpj.replace(/\D/g, "") === CNPJ_COLLAB_PENDENTE;
}
