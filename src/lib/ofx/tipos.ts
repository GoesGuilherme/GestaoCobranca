export type ResumoOfx = {
  id: string;
  nomeArquivo: string;
  banco: string;
  contaMascarada: string;
  baixadas: number;
  sugestoes: number;
  naoIdentificadas: number;
  jaImportadas: number;
  criadoEm: string;
};

export type CandidataOfx = {
  id: string;
  cliente: string;
  valor: string;
  vencimento: string;
  status: string;
};

export type SugestaoOfx = {
  id: string;
  data: string;
  valor: string;
  nome: string;
  descricao: string;
  candidatas: CandidataOfx[];
};

export type CreditoNaoIdentificado = {
  id: string;
  data: string;
  valor: string;
  nome: string;
  descricao: string;
};

export type PainelOfx = {
  ultima: ResumoOfx | null;
  historico: ResumoOfx[];
  sugestoes: SugestaoOfx[];
  naoIdentificadas: CreditoNaoIdentificado[];
};
