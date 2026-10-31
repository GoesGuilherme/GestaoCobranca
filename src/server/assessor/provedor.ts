import type { FerramentasAssessor } from "./ferramentas";

export type MensagemModelo = {
  papel: "user" | "assistant";
  texto: string;
};

export type EntradaProvedor = {
  sistema: string;
  historico: MensagemModelo[];
  textoUsuario: string;
  ferramentas: FerramentasAssessor;
  maxTokens: number;
  timeoutMs: number;
};

export type SaidaProvedor = {
  texto: string;
  tokens: number;
};

export type ProvedorAssessor = {
  gerar(entrada: EntradaProvedor): Promise<SaidaProvedor>;
};
