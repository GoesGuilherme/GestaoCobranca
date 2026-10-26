import { dataHojeIso, isoDeData } from "./data";

export const NOME_REGUA_SUGERIDA = "Padrão";

export type PassoSugerido = {
  naEmissao: boolean;
  dias: number | null;
  assunto: string;
  corpo: string;
};

// Gravados só quando a empresa liga a régua e ainda não tem nenhuma.
// O envio usa o que estiver salvo, não esta lista.
export const PASSOS_SUGERIDOS: PassoSugerido[] = [
  {
    naEmissao: true,
    dias: null,
    assunto: "Cobrança de {empresa} para {cliente}",
    corpo: "Olá, {cliente}. A {empresa} emitiu a cobrança de {servico}, no valor de {valor}, com vencimento em {vencimento}: {link}",
  },
  {
    naEmissao: false,
    dias: -5,
    assunto: "Sua cobrança vence em 5 dias",
    corpo: "Olá, {cliente}. A cobrança de {servico}, no valor de {valor}, vence em {vencimento}: {link}",
  },
  {
    naEmissao: false,
    dias: 0,
    assunto: "Sua cobrança vence hoje",
    corpo: "Olá, {cliente}. A cobrança de {servico}, no valor de {valor}, vence hoje ({vencimento}): {link}",
  },
  {
    naEmissao: false,
    dias: 3,
    assunto: "Cobrança em atraso há {dias_atraso} dias",
    corpo: "Olá, {cliente}. A cobrança de {servico}, no valor de {valor}, está em atraso há {dias_atraso} dias. Vencimento: {vencimento}. {link}",
  },
  {
    naEmissao: false,
    dias: 7,
    assunto: "Cobrança em atraso há {dias_atraso} dias",
    corpo: "Olá, {cliente}. A cobrança de {servico}, no valor de {valor}, está em atraso há {dias_atraso} dias. Vencimento: {vencimento}. {link}",
  },
];

export const AMOSTRA_REGUA = {
  cliente: "Cliente exemplo",
  servico: "Serviço exemplo",
  valor: "R$ 150,00",
  vencimento: "26/10/2026",
  link: "https://exemplo.test/cobranca",
  diasAtraso: "3",
};

function trocar(texto: string, token: string, valor: string) {
  return texto.split(token).join(valor);
}

export function textoRegua(
  modelo: string,
  dados: {
    cliente: string;
    servico: string;
    valor: string;
    vencimento: string;
    link: string;
    diasAtraso: string;
    empresa: string;
  },
): string {
  return trocar(
    trocar(
      trocar(
        trocar(
          trocar(
            trocar(trocar(modelo, "{cliente}", dados.cliente), "{servico}", dados.servico),
            "{valor}",
            dados.valor,
          ),
          "{vencimento}",
          dados.vencimento,
        ),
        "{link}",
        dados.link,
      ),
      "{dias_atraso}",
      dados.diasAtraso,
    ),
    "{empresa}",
    dados.empresa,
  ).slice(0, 2000);
}

export function assuntoRegua(assunto: string, modoTeste: boolean): string {
  const base = assunto.trim();
  if (!modoTeste) return base;
  if (base.startsWith("[Teste] ")) return base;
  return `[Teste] ${base}`;
}

export function rotuloPasso(passo: { naEmissao: boolean; dias: number | null }): string {
  if (passo.naEmissao) return "Na emissão";
  const dias = passo.dias ?? 0;
  if (dias === 0) return "No vencimento";
  if (dias < 0) {
    const n = Math.abs(dias);
    return n === 1 ? "1 dia antes" : `${n} dias antes`;
  }
  return dias === 1 ? "1 dia de atraso" : `${dias} dias de atraso`;
}

export function rotuloAtribuicao(dados: { pausada: boolean; nome: string | null }): string {
  if (!dados.nome) return dados.pausada ? "Régua pausada" : "Sem régua";
  if (dados.pausada) return `Régua pausada · ${dados.nome}`;
  return `Régua: ${dados.nome}`;
}

export function diaSemanaIso(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay();
}

export function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return isoDeData(data);
}

export function diferencaDias(de: string, ate: string): number {
  const inicio = Date.parse(`${de}T00:00:00.000Z`);
  const fim = Date.parse(`${ate}T00:00:00.000Z`);
  return Math.round((fim - inicio) / 86400000);
}

export function horaSaoPaulo(agora: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const hora = Number(partes.find((parte) => parte.type === "hour")?.value ?? "0");
  return hora === 24 ? 0 : hora;
}

export function dataSaoPaulo(agora: Date): string {
  return dataHojeIso(agora);
}

export function dentroDaJanela(hora: number, inicio: number, fim: number): boolean {
  return hora >= inicio && hora < fim;
}

// O alvo no sábado ou no domingo sai na segunda, com no máximo dois dias de atraso,
// quando a régua não envia no fim de semana. Fora isso, só no dia exato.
export function passoCombina(hoje: string, alvo: string, enviarFimDeSemana: boolean): boolean {
  const diaHoje = diaSemanaIso(hoje);
  const fimDeSemana = diaHoje === 0 || diaHoje === 6;
  if (!enviarFimDeSemana && fimDeSemana) return false;
  if (hoje === alvo) return true;
  if (!enviarFimDeSemana && diaHoje === 1) {
    const atraso = diferencaDias(alvo, hoje);
    const diaAlvo = diaSemanaIso(alvo);
    if (diaAlvo === 6 && atraso === 2) return true;
    if (diaAlvo === 0 && atraso === 1) return true;
  }
  return false;
}

export function diasAtraso(hoje: string, vencimento: string): number {
  return Math.max(0, diferencaDias(vencimento, hoje));
}

export function opcoesDePasso(reguas: { nome: string; passos: { id: string; naEmissao: boolean; dias: number | null }[] }[]) {
  return reguas.flatMap((regua) =>
    regua.passos.map((passo) => ({
      id: passo.id,
      rotulo: `${regua.nome} · ${rotuloPasso(passo)}`,
    })),
  );
}
