import { dataIsoValida } from "@/lib/data";
import { somarDias } from "@/lib/regua";

export function deveEmitirRecorrencia(proximoVencimento: string, hoje: string, diasAntes: number): boolean {
  if (!dataIsoValida(proximoVencimento) || !dataIsoValida(hoje)) return false;
  const antecedencia = Number.isInteger(diasAntes) && diasAntes > 0 ? diasAntes : 0;
  return proximoVencimento <= somarDias(hoje, antecedencia);
}

export function avancarMes(iso: string, dia: number): string {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  let anoAlvo = ano;
  let mesAlvo = mes + 1;
  if (mesAlvo > 12) {
    mesAlvo = 1;
    anoAlvo += 1;
  }
  const ultimo = new Date(Date.UTC(anoAlvo, mesAlvo, 0)).getUTCDate();
  const diaReal = Math.min(Math.max(dia, 1), ultimo);
  return `${anoAlvo}-${String(mesAlvo).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
}

export function chaveRecorrencia(vinculoId: string, vencimento: string): string {
  return `rec-${vinculoId}-${vencimento}`;
}
