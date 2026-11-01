export type PassoDaRegua = {
  id: string;
  ordem?: number;
  naEmissao: boolean;
  dias: number | null;
  assunto?: string;
  enviarWhatsapp?: boolean;
};

export type ReguaParaProgresso = {
  id: string;
  padrao: boolean;
  nome: string;
  passos: PassoDaRegua[];
};

export type EnvioReguaLista = {
  faturaId: string;
  passoId: string | null;
  canal: string;
  status: string;
};
