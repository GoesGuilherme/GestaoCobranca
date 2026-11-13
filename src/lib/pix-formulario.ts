import { dataHojeIso, dataIsoValida } from "./data";
import { textoEmv } from "./pix-brcode";
import { normalizarChavePix, type RascunhoPix } from "./pix-chave";
import { esquemaConfiguracaoPix } from "./validacao";

function foto(entrada: RascunhoPix): string | null {
  const validado = esquemaConfiguracaoPix.safeParse(entrada);
  if (!validado.success) return null;
  const chave = normalizarChavePix(validado.data.tipoChave, validado.data.chavePix);
  if (!chave.ok) return null;
  const nome = textoEmv(validado.data.nomeRecebedor, 25);
  const cidade = textoEmv(validado.data.cidadeRecebedor, 15);
  if (!nome || !cidade) return null;
  return JSON.stringify({
    tipoChave: chave.tipo,
    chavePix: chave.chave,
    nomeRecebedor: validado.data.nomeRecebedor.trim(),
    cidadeRecebedor: validado.data.cidadeRecebedor.trim(),
    usarNasCobrancas: validado.data.usarNasCobrancas,
  });
}

// O botão Salvar começa desligado. Só liga com dado válido diferente do que já está gravado.
export function salvarPixHabilitado(atual: RascunhoPix, inicial: RascunhoPix): boolean {
  const agora = foto(atual);
  if (!agora) return false;
  return agora !== foto(inicial);
}

export function confirmarBaixaHabilitado(pagoEm: string, confirmado: boolean, hoje = dataHojeIso()): boolean {
  if (!confirmado) return false;
  if (!dataIsoValida(pagoEm) || !dataIsoValida(hoje)) return false;
  return pagoEm <= hoje;
}
