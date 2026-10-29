import { inteiroDeCampo } from "./inteiro-campo";
import { rotuloPasso } from "./regua";

export const MENSAGEM_DIAS_REGUA =
  "Informe os dias em relação ao vencimento com um número inteiro entre -365 e 365. Use negativo antes, zero no dia e positivo em atraso.";

export const MENSAGEM_HORA_REGUA = "Informe a hora com um número inteiro de 0 a 23.";

export const MENSAGEM_JANELA_REGUA = "A hora final precisa ser depois da hora inicial.";

const DIAS_MIN = -365;
const DIAS_MAX = 365;

export type PassoRascunho = {
  id?: string;
  naEmissao: boolean;
  dias: string;
  assunto: string;
  corpo: string;
};

export type ReguaRascunho = {
  nome: string;
  padrao: boolean;
  horaInicio: string;
  horaFim: string;
  enviarFimDeSemana: boolean;
  passos: PassoRascunho[];
};

export type PassoParaSalvar = {
  id?: string;
  naEmissao: boolean;
  dias: number | null;
  canal: "EMAIL";
  assunto: string;
  corpo: string;
};

export type ReguaParaSalvar = {
  nome: string;
  padrao: boolean;
  horaInicio: number;
  horaFim: number;
  enviarFimDeSemana: boolean;
  passos: PassoParaSalvar[];
};

export function textoDiasDe(dias: number | null, naEmissao: boolean): string {
  if (naEmissao || dias === null) return "";
  return String(dias);
}

export function rotuloPassoRascunho(passo: { naEmissao: boolean; dias: string }): string {
  if (passo.naEmissao) return rotuloPasso({ naEmissao: true, dias: null });
  const dias = inteiroDeCampo(passo.dias);
  if (dias === null) return "Dias em relação ao vencimento";
  return rotuloPasso({ naEmissao: false, dias });
}

function horaDeCampo(texto: string): number | null {
  const valor = inteiroDeCampo(texto);
  if (valor === null || valor < 0 || valor > 23) return null;
  return valor;
}

export function montarReguaParaSalvar(
  rascunho: ReguaRascunho,
): { ok: true; corpo: ReguaParaSalvar } | { ok: false; mensagem: string } {
  const horaInicio = horaDeCampo(rascunho.horaInicio);
  const horaFim = horaDeCampo(rascunho.horaFim);
  if (horaInicio === null || horaFim === null) {
    return { ok: false, mensagem: MENSAGEM_HORA_REGUA };
  }
  if (horaInicio >= horaFim) {
    return { ok: false, mensagem: MENSAGEM_JANELA_REGUA };
  }

  const passos: PassoParaSalvar[] = [];
  for (const passo of rascunho.passos) {
    if (passo.naEmissao) {
      passos.push({
        id: passo.id,
        naEmissao: true,
        dias: null,
        canal: "EMAIL",
        assunto: passo.assunto,
        corpo: passo.corpo,
      });
      continue;
    }
    const dias = inteiroDeCampo(passo.dias);
    if (dias === null || dias < DIAS_MIN || dias > DIAS_MAX) {
      return { ok: false, mensagem: MENSAGEM_DIAS_REGUA };
    }
    passos.push({
      id: passo.id,
      naEmissao: false,
      dias,
      canal: "EMAIL",
      assunto: passo.assunto,
      corpo: passo.corpo,
    });
  }

  return {
    ok: true,
    corpo: {
      nome: rascunho.nome,
      padrao: rascunho.padrao,
      horaInicio,
      horaFim,
      enviarFimDeSemana: rascunho.enviarFimDeSemana,
      passos,
    },
  };
}
