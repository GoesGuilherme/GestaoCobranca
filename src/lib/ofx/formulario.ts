import { LIMITE_OFX_BYTES } from "./limite";

export function importarOfxHabilitado(arquivo: { nome: string; tamanho: number } | null): boolean {
  if (!arquivo) return false;
  if (!arquivo.nome.toLowerCase().endsWith(".ofx")) return false;
  return arquivo.tamanho > 0 && arquivo.tamanho <= LIMITE_OFX_BYTES;
}

// Uma sugestão com uma cobrança confirma num clique. Com várias, só depois da escolha.
export function confirmarOfxHabilitado(quantidade: number, faturaId: string): boolean {
  if (quantidade === 1) return true;
  return faturaId.trim().length > 0;
}
