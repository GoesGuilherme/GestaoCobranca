import { dataHojeIso, isoDeData } from "./data";
import { STATUS_PAGAS } from "./fatura-situacao";
import type { ModoReguaCliente } from "./tipos";

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

export type PassoParaRotulo = {
  naEmissao: boolean;
  dias: number | null;
  assunto: string;
};

export type FaseRegua = "antes" | "hoje" | "atraso" | "encerrada";

export type RotuloReguaFatura = {
  fase: FaseRegua;
  texto: string;
  aria: string;
};

const FASE_ARIA: Record<Exclude<FaseRegua, "encerrada">, string> = {
  antes: "Antes do vencimento",
  hoje: "No vencimento",
  atraso: "Em atraso",
};

export function passosDaAtribuicao(
  atribuicao: { modo: ModoReguaCliente; reguaId: string | null },
  reguas: { id: string; padrao: boolean; passos: PassoParaRotulo[] }[],
): PassoParaRotulo[] | null {
  if (atribuicao.modo === "NENHUMA") return null;
  const regua =
    atribuicao.modo === "ESPECIFICA"
      ? reguas.find((item) => item.id === atribuicao.reguaId)
      : reguas.find((item) => item.padrao);
  if (!regua || regua.passos.length === 0) return null;
  return regua.passos;
}

export function rotuloReguaDaFatura(entrada: {
  status: string;
  excluida: boolean;
  vencimento: string;
  hoje: string;
  passos: PassoParaRotulo[] | null;
}): RotuloReguaFatura | null {
  if (entrada.excluida || STATUS_PAGAS.some((status) => status === entrada.status)) {
    return { fase: "encerrada", texto: "Encerrada", aria: "Régua encerrada" };
  }
  if (!entrada.passos || entrada.passos.length === 0) return null;

  const diff = diferencaDias(entrada.vencimento, entrada.hoje);
  const fase: Exclude<FaseRegua, "encerrada"> = diff < 0 ? "antes" : diff === 0 ? "hoje" : "atraso";
  const texto = textoDoPasso(entrada.passos, diff, fase);
  return { fase, texto, aria: `${FASE_ARIA[fase]}: ${texto}` };
}

function textoDoPasso(passos: PassoParaRotulo[], diff: number, fase: Exclude<FaseRegua, "encerrada">): string {
  const comDias = passos.filter((passo) => !passo.naEmissao && typeof passo.dias === "number");
  if (fase === "hoje") {
    const noDia = comDias.find((passo) => passo.dias === 0);
    return noDia ? nomeDoPasso(noDia) : rotuloPasso({ naEmissao: false, dias: 0 });
  }
  if (fase === "antes") {
    const anteriores = comDias.filter((passo) => (passo.dias as number) < 0);
    const alcancado = maiorDias(anteriores.filter((passo) => (passo.dias as number) <= diff));
    if (alcancado) return nomeDoPasso(alcancado);
    const proximo = menorDias(anteriores.filter((passo) => (passo.dias as number) > diff));
    if (proximo) return nomeDoPasso(proximo);
  } else {
    const posteriores = comDias.filter((passo) => (passo.dias as number) > 0);
    const alcancado = maiorDias(posteriores.filter((passo) => (passo.dias as number) <= diff));
    if (alcancado) return nomeDoPasso(alcancado);
    const proximo = menorDias(posteriores.filter((passo) => (passo.dias as number) > diff));
    if (proximo) return nomeDoPasso(proximo);
  }
  const emissao = passos.find((passo) => passo.naEmissao);
  if (emissao) return nomeDoPasso(emissao);
  return rotuloPasso({ naEmissao: false, dias: diff });
}

function nomeDoPasso(passo: PassoParaRotulo): string {
  const assunto = passo.assunto.trim();
  return assunto || rotuloPasso(passo);
}

function maiorDias(passos: PassoParaRotulo[]): PassoParaRotulo | null {
  return passos.reduce<PassoParaRotulo | null>((escolhido, passo) => {
    if (!escolhido || (passo.dias as number) > (escolhido.dias as number)) return passo;
    return escolhido;
  }, null);
}

function menorDias(passos: PassoParaRotulo[]): PassoParaRotulo | null {
  return passos.reduce<PassoParaRotulo | null>((escolhido, passo) => {
    if (!escolhido || (passo.dias as number) < (escolhido.dias as number)) return passo;
    return escolhido;
  }, null);
}

export type OpcaoPassoRegua = {
  id: string;
  rotulo: string;
  canal: string;
};

export function nomePassoConfigurado(passo: { naEmissao: boolean; dias: number | null; assunto?: string }): string {
  const assunto = passo.assunto?.trim() ?? "";
  return assunto || rotuloPasso(passo);
}

export function opcoesDePasso(
  reguas: { nome: string; passos: { id: string; naEmissao: boolean; dias: number | null; assunto?: string; canal?: string }[] }[],
): OpcaoPassoRegua[] {
  return reguas.flatMap((regua) =>
    regua.passos.map((passo) => ({
      id: passo.id,
      rotulo: `${regua.nome} · ${nomePassoConfigurado(passo)}`,
      canal: passo.canal || "EMAIL",
    })),
  );
}

export function opcoesDaReguaAplicavel(
  atribuicao: { modo: ModoReguaCliente; reguaId: string | null },
  reguas: { id: string; padrao: boolean; nome: string; passos: { id: string; naEmissao: boolean; dias: number | null; assunto?: string; canal?: string }[] }[],
): OpcaoPassoRegua[] {
  if (atribuicao.modo === "NENHUMA") return [];
  const regua =
    atribuicao.modo === "ESPECIFICA"
      ? reguas.find((item) => item.id === atribuicao.reguaId)
      : reguas.find((item) => item.padrao);
  if (!regua) return [];
  return opcoesDePasso([regua]);
}
