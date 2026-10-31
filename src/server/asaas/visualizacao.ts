import type { VisualizacaoCobrancaAsaas } from "./contrato";

// O exemplo oficial de invoiceViewedDate / boletoViewedDate é "2017-06-10 11:00:00",
// sem fuso. O webhook de visualização usa o mesmo formato e o horário de Brasília (UTC-3).
const SEM_FUSO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;

export function instanteVisualizacaoAsaas(valor: unknown): Date | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  const semFuso = SEM_FUSO.exec(limpo);
  if (semFuso) {
    const data = new Date(
      `${semFuso[1]}-${semFuso[2]}-${semFuso[3]}T${semFuso[4]}:${semFuso[5]}:${semFuso[6]}-03:00`,
    );
    return Number.isNaN(data.getTime()) ? null : data;
  }
  const comFuso = Date.parse(limpo);
  if (Number.isNaN(comFuso)) return null;
  return new Date(comFuso);
}

export function lerVisualizacaoAsaas(json: unknown): VisualizacaoCobrancaAsaas {
  if (!json || typeof json !== "object") return { faturaEm: null, boletoEm: null };
  const corpo = json as { invoiceViewedDate?: unknown; boletoViewedDate?: unknown };
  return {
    faturaEm: instanteVisualizacaoAsaas(corpo.invoiceViewedDate),
    boletoEm: instanteVisualizacaoAsaas(corpo.boletoViewedDate),
  };
}

export function instanteMaisAntigo(datas: Array<Date | null>): Date | null {
  let menor: Date | null = null;
  for (const data of datas) {
    if (!data || Number.isNaN(data.getTime())) continue;
    if (!menor || data.getTime() < menor.getTime()) menor = data;
  }
  return menor;
}
