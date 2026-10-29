import { normalizarDinheiro } from "./dinheiro";

const MICRO = BigInt(1000000);
const CEM = BigInt(100);
const MESES_JANELA = 12;

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const ASSINATURAS_ENCERRADAS = new Set(["INACTIVE", "CANCELADA", "EXPIRED"]);

export type VinculoMetrica = {
  clienteId: string;
  valor: string;
  inicio: string;
  fim: string | null;
  clienteFim: string | null;
  ativacao: string | null;
};

export type MesMetrica = {
  mes: string;
  rotulo: string;
  mrr: string;
  clientes: number;
  perdidos: number;
  churnClientes: bigint | null;
  mrrInicio: string;
  mrrPerdido: string;
  churnReceita: bigint | null;
};

export type MetricasSaas = {
  mrr: string;
  mrrAnterior: string;
  variacaoCentavos: bigint;
  variacao: bigint | null;
  meses: MesMetrica[];
  churnClientes: bigint | null;
  churnReceita: bigint | null;
  clientesAtivos: number;
  ticket: string | null;
  ltv: string | null;
  vidaMeses: string | null;
  mesesNaMedia: number;
  ltvDisponivel: boolean;
  semMensalidades: boolean;
  clientesSemAtivacao: number;
};

export function fimDaAssinatura(
  status: "ATIVO" | "INATIVO",
  asaasStatus: string | null,
  atualizadoIso: string,
): string | null {
  if (status !== "ATIVO") return atualizadoIso;
  if (asaasStatus && ASSINATURAS_ENCERRADAS.has(asaasStatus)) return atualizadoIso;
  return null;
}

export function fimDoCliente(status: string, atualizadoIso: string): string | null {
  if (status === "INATIVO" || status === "BLOQUEADO") return atualizadoIso;
  return null;
}

export function calcularMetricas(hoje: string, vinculos: VinculoMetrica[]): MetricasSaas {
  const grupos = agrupar(vinculos);
  const meses = mesesAte(hoje, MESES_JANELA).map((mes) => pontoDoMes(mes, hoje, vinculos, grupos));
  const atual = meses[meses.length - 1];
  const anterior = meses[meses.length - 2];
  const mrrAtual = centavos(atual?.mrr ?? "0.00");
  const mrrAnterior = centavos(anterior?.mrr ?? "0.00");
  const variacaoCentavos = mrrAtual - mrrAnterior;
  const variacao = mrrAnterior > BigInt(0) ? (variacaoCentavos * MICRO) / mrrAnterior : null;
  const comChurn = meses.filter((mes) => mes.churnClientes !== null);
  const ticketCentavos = atual && atual.clientes > 0 ? mrrAtual / BigInt(atual.clientes) : null;
  const vida = vidaMedia(grupos, hoje);
  const ltvDisponivel = ticketCentavos !== null && vida !== null && vida > BigInt(0);

  return {
    mrr: atual?.mrr ?? "0.00",
    mrrAnterior: anterior?.mrr ?? "0.00",
    variacaoCentavos,
    variacao,
    meses,
    churnClientes: atual?.churnClientes ?? null,
    churnReceita: atual?.churnReceita ?? null,
    clientesAtivos: atual?.clientes ?? 0,
    ticket: ticketCentavos === null ? null : texto(ticketCentavos),
    ltv: ltvDisponivel && ticketCentavos !== null && vida !== null ? texto((ticketCentavos * vida) / BigInt(10)) : null,
    vidaMeses: vida !== null && vida > BigInt(0) ? formatarDecimos(vida) : null,
    mesesNaMedia: comChurn.length,
    ltvDisponivel,
    semMensalidades: vinculos.length === 0,
    clientesSemAtivacao: [...grupos.values()].filter((grupo) => grupo.semAtivacao).length,
  };
}

export function formatarMicrosPercentual(micros: bigint | null): string {
  if (micros === null) return "—";
  const negativo = micros < BigInt(0);
  const absoluto = negativo ? -micros : micros;
  const inteiro = absoluto / BigInt(10000);
  const decimo = (absoluto % BigInt(10000)) / BigInt(1000);
  const corpo = decimo === BigInt(0) ? `${inteiro}%` : `${inteiro},${decimo}%`;
  return negativo ? `−${corpo}` : corpo;
}

type BaseCliente = {
  entrada: string;
  saida: string | null;
  semAtivacao: boolean;
};

function agrupar(vinculos: VinculoMetrica[]): Map<string, BaseCliente> {
  const grupos = new Map<string, VinculoMetrica[]>();
  for (const vinculo of vinculos) {
    const lista = grupos.get(vinculo.clienteId) ?? [];
    lista.push(vinculo);
    grupos.set(vinculo.clienteId, lista);
  }
  const bases = new Map<string, BaseCliente>();
  for (const [id, lista] of grupos) {
    const ativacao = lista.find((item) => item.ativacao)?.ativacao ?? null;
    const inicios = lista.map((item) => item.inicio).sort();
    const entrada = ativacao ?? inicios[0];
    if (!entrada) continue;
    const clienteFim = lista.find((item) => item.clienteFim)?.clienteFim ?? null;
    const fins = lista.map((item) => item.fim);
    const todasEncerradas = fins.every((fim) => fim !== null);
    const ultimoFim = todasEncerradas ? [...fins].filter((fim): fim is string => fim !== null).sort().at(-1) ?? null : null;
    bases.set(id, {
      entrada,
      saida: maisCedo(clienteFim, ultimoFim),
      semAtivacao: ativacao === null,
    });
  }
  return bases;
}

function maisCedo(primeira: string | null, segunda: string | null): string | null {
  if (!primeira) return segunda;
  if (!segunda) return primeira;
  return primeira < segunda ? primeira : segunda;
}

function naBase(grupos: Map<string, BaseCliente>, dia: string): Set<string> {
  const clientes = new Set<string>();
  for (const [id, base] of grupos) {
    if (base.entrada <= dia && (base.saida === null || base.saida > dia)) clientes.add(id);
  }
  return clientes;
}

function vidaMedia(grupos: Map<string, BaseCliente>, hoje: string): bigint | null {
  const tempos: bigint[] = [];
  for (const base of grupos.values()) {
    const ate = base.saida !== null && base.saida <= hoje ? base.saida : hoje;
    if (ate < base.entrada) continue;
    tempos.push(BigInt(diasEntre(base.entrada, ate)) * BigInt(10) / BigInt(30));
  }
  if (tempos.length === 0) return null;
  return tempos.reduce((total, item) => total + item, BigInt(0)) / BigInt(tempos.length);
}

function diasEntre(de: string, ate: string): number {
  const [anoDe, mesDe, diaDe] = de.split("-").map(Number);
  const [anoAte, mesAte, diaAte] = ate.split("-").map(Number);
  return Math.round((Date.UTC(anoAte, mesAte - 1, diaAte) - Date.UTC(anoDe, mesDe - 1, diaDe)) / 86400000);
}

function pontoDoMes(
  mes: string,
  hoje: string,
  vinculos: VinculoMetrica[],
  grupos: Map<string, BaseCliente>,
): MesMetrica {
  const fim = diaDoPonto(mes, hoje);
  const inicio = ultimoDia(mesAnterior(mes));
  const agora = retrato(vinculos, fim);
  const antes = retrato(vinculos, inicio);
  const baseAgora = naBase(grupos, fim);
  const baseAntes = naBase(grupos, inicio);
  const perdidos = [...baseAntes].filter((cliente) => !baseAgora.has(cliente)).length;
  const mantido = mrrMantido(vinculos, inicio, fim);
  const perdido = antes.mrr > mantido ? antes.mrr - mantido : BigInt(0);
  return {
    mes,
    rotulo: rotuloMes(mes),
    mrr: texto(agora.mrr),
    clientes: agora.clientes.size,
    perdidos,
    churnClientes: baseAntes.size > 0 ? (BigInt(perdidos) * MICRO) / BigInt(baseAntes.size) : null,
    mrrInicio: texto(antes.mrr),
    mrrPerdido: texto(perdido),
    churnReceita: antes.mrr > BigInt(0) ? (perdido * MICRO) / antes.mrr : null,
  };
}

function retrato(vinculos: VinculoMetrica[], dia: string): { mrr: bigint; clientes: Set<string> } {
  const clientes = new Set<string>();
  let mrr = BigInt(0);
  for (const vinculo of vinculos) {
    if (!vigente(vinculo, dia)) continue;
    clientes.add(vinculo.clienteId);
    mrr += centavos(vinculo.valor);
  }
  return { mrr, clientes };
}

function mrrMantido(vinculos: VinculoMetrica[], inicio: string, fim: string): bigint {
  let total = BigInt(0);
  for (const vinculo of vinculos) {
    if (!vigente(vinculo, inicio) || !vigente(vinculo, fim)) continue;
    total += centavos(vinculo.valor);
  }
  return total;
}

function vigente(vinculo: VinculoMetrica, dia: string): boolean {
  if (vinculo.inicio > dia) return false;
  if (vinculo.fim !== null && vinculo.fim <= dia) return false;
  if (vinculo.clienteFim !== null && vinculo.clienteFim <= dia) return false;
  return true;
}

function mesesAte(hoje: string, quantidade: number): string[] {
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7));
  const lista: string[] = [];
  for (let i = 0; i < quantidade; i += 1) lista.push(`${ano}-${String(mes).padStart(2, "0")}`);
  for (let i = quantidade - 2; i >= 0; i -= 1) {
    mes -= 1;
    if (mes < 1) {
      mes = 12;
      ano -= 1;
    }
    lista[i] = `${ano}-${String(mes).padStart(2, "0")}`;
  }
  return lista;
}

function diaDoPonto(mes: string, hoje: string): string {
  if (mes === hoje.slice(0, 7)) return hoje;
  return ultimoDia(mes);
}

function mesAnterior(mes: string): string {
  let ano = Number(mes.slice(0, 4));
  let numero = Number(mes.slice(5, 7)) - 1;
  if (numero < 1) {
    numero = 12;
    ano -= 1;
  }
  return `${ano}-${String(numero).padStart(2, "0")}`;
}

function ultimoDia(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const dia = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

function rotuloMes(mes: string): string {
  const numero = Number(mes.slice(5, 7));
  return `${NOMES_MES[numero - 1]}/${mes.slice(2, 4)}`;
}

function centavos(valor: string): bigint {
  const normal = normalizarDinheiro(valor) ?? "0.00";
  const [inteiro, frac] = normal.split(".");
  return BigInt(inteiro) * CEM + BigInt(frac);
}

function texto(centavosValor: bigint): string {
  const inteiro = centavosValor / CEM;
  const frac = (centavosValor % CEM).toString().padStart(2, "0");
  return `${inteiro}.${frac}`;
}

function formatarDecimos(decimos: bigint): string {
  return `${decimos / BigInt(10)},${decimos % BigInt(10)}`;
}
