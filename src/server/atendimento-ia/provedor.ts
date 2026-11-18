import type { FerramentasAtendimento } from "./ferramentas";

export type MensagemModelo = {
  papel: "user" | "assistant";
  texto: string;
};

export type EntradaProvedor = {
  sistema: string;
  historico: MensagemModelo[];
  textoUsuario: string;
  ferramentas: FerramentasAtendimento;
  maxTokens: number;
  timeoutMs: number;
};

export type SaidaProvedor = {
  texto: string;
  tokens: number;
  saidas: { texto: string; ids?: string[] }[];
};

export type ProvedorAtendimentoIa = {
  gerar(entrada: EntradaProvedor): Promise<SaidaProvedor>;
};
