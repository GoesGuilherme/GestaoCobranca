import type { Segmento, StatusCliente, StatusFilial } from "./tipos";

export const SEGMENTOS: { valor: Segmento; rotulo: string }[] = [
  { valor: "RESTAURANTE", rotulo: "Restaurante" },
  { valor: "MERCADO_AUTONOMO", rotulo: "Mercado autônomo" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export const STATUS_CLIENTE: { valor: StatusCliente; rotulo: string }[] = [
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "INATIVO", rotulo: "Inativo" },
  { valor: "EM_IMPLANTACAO", rotulo: "Em implantação" },
];

export const STATUS_FILIAL: { valor: StatusFilial; rotulo: string }[] = [
  { valor: "ATIVA", rotulo: "Ativa" },
  { valor: "INATIVA", rotulo: "Inativa" },
  { valor: "EM_IMPLANTACAO", rotulo: "Em implantação" },
];

export function rotuloSegmento(valor: Segmento): string {
  return SEGMENTOS.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloStatusCliente(valor: StatusCliente): string {
  return STATUS_CLIENTE.find((item) => item.valor === valor)?.rotulo ?? valor;
}

export function rotuloStatusFilial(valor: StatusFilial): string {
  return STATUS_FILIAL.find((item) => item.valor === valor)?.rotulo ?? valor;
}
