import { dataHojeIso, dataIsoValida } from "@/lib/data";
import { STATUS_NORMALIZADO, statusNormalizado } from "@/lib/status-pagamento";
import type { ResultadoAtualizacaoAsaas } from "@/lib/tipos";
import {
  type CobrancaAsaas,
  type ClienteHttpAsaas,
  ErroAsaas,
  type FiltroListaCobrancasAsaas,
} from "@/server/asaas/contrato";
import { logAsaas, logAsaasErro, mensagemLogAsaas } from "@/server/asaas/log";
import { abrirClienteAsaas } from "@/server/asaas/abrir";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirAtualizarVisualizacoes } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { aplicarPagamentoAsaas } from "./asaas-webhook-service";
import { enfileirarPagoDoPagamento } from "./whatsapp-pago";
import { conciliarPromessas } from "./promessa-service";
import { sincronizarVisualizacoesEmpresa } from "./visualizacao-fatura-service";

/** Janela da lista de cobranças alteradas. Cobre um cron perdido e a fila parada do webhook. */
const DIAS_RECENTES = 14;
const LIMITE_PAGINA = 100;
const MAX_PAGINAS_CRON = 2;
const MAX_PAGINAS_MANUAL = 3;
const LIMITE_ABERTAS_CRON = 40;
const LIMITE_ABERTAS_MANUAL = 80;
const CONCORRENCIA = 3;
const PAUSA_MS = 700;
const PRAZO_CRON_MS = 45_000;
const PRAZO_MANUAL_MS = 50_000;

const STATUS_PAGOS = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] as const;

export type ClienteConciliacaoAsaas = Pick<ClienteHttpAsaas, "obterCobranca" | "listarCobrancas">;

export type OpcoesConciliacaoAsaas = {
  http?: ClienteConciliacaoAsaas;
  httpDaEmpresa?: (empresaId: string) => ClienteConciliacaoAsaas;
  agora?: Date;
  pausaMs?: number;
  pausar?: (ms: number) => Promise<void>;
  manual?: boolean;
  limiteAbertas?: number;
  maxPaginas?: number;
  prazoMs?: number;
  prazoEm?: number;
};

export type ResultadoConciliacaoEmpresa = {
  empresaId: string;
  consultadas: number;
  atualizadas: number;
  criadas: number;
  ignoradas: number;
  falhas: number;
  restantes: number;
  interrompida: boolean;
  naoAutorizado: boolean;
  semConfiguracao: boolean;
};

export type ResultadoConciliacaoAsaas = {
  empresas: number;
  consultadas: number;
  atualizadas: number;
  criadas: number;
  falhas: number;
  empresasComFalha: number;
  interrompidas: number;
};

type LocalFatura = {
  status: string;
  excluida: boolean;
  pagoEm: Date | null;
};

type Andamento = {
  consultadas: number;
  atualizadas: number;
  criadas: number;
  ignoradas: number;
  falhas: number;
  interrompida: boolean;
  naoAutorizado: boolean;
  listaIncompleta: boolean;
};

function vazioEmpresa(empresaId: string, semConfiguracao = false): ResultadoConciliacaoEmpresa {
  return {
    empresaId,
    consultadas: 0,
    atualizadas: 0,
    criadas: 0,
    ignoradas: 0,
    falhas: 0,
    restantes: 0,
    interrompida: false,
    naoAutorizado: false,
    semConfiguracao,
  };
}

async function pausaPadrao(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isoMenosDias(hoje: string, dias: number): string {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

function diaUtc(data: Date | null): string | null {
  if (!data) return null;
  return data.toISOString().slice(0, 10);
}

function ondeAberta(empresaId: string) {
  return {
    empresaId,
    excluida: false,
    asaasPaymentId: { not: null },
    OR: [
      { status: { in: ["PENDING", "OVERDUE"] } },
      { statusNormalizado: { in: [STATUS_NORMALIZADO.PENDENTE, STATUS_NORMALIZADO.VENCIDO] } },
    ],
  };
}

function pagamentoDaCobranca(cobranca: CobrancaAsaas): Record<string, unknown> {
  const pagamento: Record<string, unknown> = {
    id: cobranca.id,
    customer: cobranca.customer,
    value: cobranca.valor,
    dueDate: cobranca.vencimento,
    status: cobranca.status,
    billingType: cobranca.formaCobranca,
    deleted: cobranca.excluida,
  };
  if (cobranca.subscription) pagamento.subscription = cobranca.subscription;
  if (cobranca.boletoUrl) pagamento.bankSlipUrl = cobranca.boletoUrl;
  if (cobranca.faturaUrl) pagamento.invoiceUrl = cobranca.faturaUrl;
  if (cobranca.descricao) pagamento.description = cobranca.descricao;
  if (cobranca.pagoEm) pagamento.clientPaymentDate = cobranca.pagoEm;
  if (cobranca.cartao) {
    pagamento.creditCard = {
      creditCardBrand: cobranca.cartao.bandeira,
      creditCardNumber: cobranca.cartao.final,
    };
  }
  return pagamento;
}

function tipoDaCobranca(cobranca: CobrancaAsaas): string {
  if (cobranca.excluida) return "PAYMENT_DELETED";
  switch (cobranca.status) {
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "PAYMENT_RECEIVED";
    case "CONFIRMED":
      return "PAYMENT_CONFIRMED";
    case "DUNNING_RECEIVED":
      return "PAYMENT_DUNNING_RECEIVED";
    case "OVERDUE":
      return "PAYMENT_OVERDUE";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return "PAYMENT_REFUNDED";
    case "PENDING":
      return "PAYMENT_CREATED";
    default:
      return "PAYMENT_UPDATED";
  }
}

function precisaAplicar(local: LocalFatura | undefined, cobranca: CobrancaAsaas): boolean {
  if (!local) return true;
  if (local.excluida !== cobranca.excluida) return true;
  if (local.status !== cobranca.status) return true;
  const paga = statusNormalizado(cobranca.status) === STATUS_NORMALIZADO.PAGO && !cobranca.excluida;
  if (paga) {
    if (!cobranca.pagoEm) return false;
    return diaUtc(local.pagoEm) !== cobranca.pagoEm;
  }
  return local.pagoEm !== null;
}

function limiteParado(erro: unknown, andamento: Andamento): boolean {
  if (!(erro instanceof ErroAsaas)) return false;
  if (erro.status !== 429 && erro.status !== 401) return false;
  andamento.interrompida = true;
  if (erro.status === 401) andamento.naoAutorizado = true;
  return true;
}

async function listarFaixa(
  http: ClienteConciliacaoAsaas,
  filtro: Omit<FiltroListaCobrancasAsaas, "offset" | "limit">,
  mapa: Map<string, CobrancaAsaas>,
  andamento: Andamento,
  maxPaginas: number,
  pausaMs: number,
  pausar: (ms: number) => Promise<void>,
  prazo: number,
  marcarIncompleta: boolean,
) {
  let offset = 0;
  for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
    if (Date.now() >= prazo) {
      andamento.interrompida = true;
      andamento.listaIncompleta = true;
      return;
    }
    if (pagina > 0) await pausar(pausaMs);
    let lote;
    try {
      lote = await http.listarCobrancas({ ...filtro, offset, limit: LIMITE_PAGINA });
    } catch (erro) {
      if (limiteParado(erro, andamento)) return;
      andamento.falhas += 1;
      logAsaasErro("conciliacao_lista", { erro: mensagemLogAsaas(erro) });
      return;
    }
    andamento.consultadas += 1;
    for (const cobranca of lote.cobrancas) mapa.set(cobranca.id, cobranca);
    if (!lote.temMais || lote.cobrancas.length === 0) return;
    offset += lote.cobrancas.length;
    if (marcarIncompleta && pagina === maxPaginas - 1) andamento.listaIncompleta = true;
  }
}

async function consultarPorId(
  http: ClienteConciliacaoAsaas,
  ids: string[],
  mapa: Map<string, CobrancaAsaas>,
  andamento: Andamento,
  prazo: number,
) {
  const faltam = ids.filter((id) => !mapa.has(id));
  let indice = 0;
  let parar = false;

  async function trabalhador() {
    while (!parar) {
      if (Date.now() >= prazo) {
        parar = true;
        andamento.interrompida = true;
        return;
      }
      const atual = indice;
      indice += 1;
      const id = faltam[atual];
      if (!id) return;
      try {
        const cobranca = await http.obterCobranca(id);
        mapa.set(cobranca.id, cobranca);
        andamento.consultadas += 1;
      } catch (erro) {
        if (limiteParado(erro, andamento)) {
          parar = true;
          return;
        }
        andamento.falhas += 1;
        andamento.consultadas += 1;
        logAsaasErro("conciliacao_cobranca", { erro: mensagemLogAsaas(erro) });
      }
    }
  }

  const trabalhadores = Math.min(CONCORRENCIA, faltam.length);
  if (trabalhadores > 0) {
    await Promise.all(Array.from({ length: trabalhadores }, () => trabalhador()));
  }
}

async function aplicarMapa(empresaId: string, mapa: Map<string, CobrancaAsaas>, andamento: Andamento, agora: Date) {
  const ids = [...mapa.keys()];
  const locais = new Map<string, LocalFatura>();
  if (ids.length > 0) {
    const linhas = await prisma.fatura.findMany({
      where: { empresaId, asaasPaymentId: { in: ids } },
      select: { asaasPaymentId: true, status: true, excluida: true, pagoEm: true },
    });
    for (const linha of linhas) {
      if (!linha.asaasPaymentId) continue;
      locais.set(linha.asaasPaymentId, linha);
    }
  }

  let mudou = false;
  for (const cobranca of mapa.values()) {
    const local = locais.get(cobranca.id);
    if (!precisaAplicar(local, cobranca)) continue;
    try {
      const pagamento = pagamentoDaCobranca(cobranca);
      const tipo = tipoDaCobranca(cobranca);
      const efeito = await prisma.$transaction((tx) => aplicarPagamentoAsaas(tx, empresaId, pagamento, tipo));
      await enfileirarPagoDoPagamento(empresaId, pagamento, tipo, agora);
      if (efeito === "criada") andamento.criadas += 1;
      else if (efeito === "atualizada") andamento.atualizadas += 1;
      else andamento.ignoradas += 1;
      if (efeito === "criada" || efeito === "atualizada") mudou = true;
    } catch (erro) {
      andamento.falhas += 1;
      logAsaasErro("conciliacao_gravacao", { empresaId, erro: mensagemLogAsaas(erro) });
    }
  }
  if (mudou) await conciliarPromessas(empresaId);
}

export async function conciliarAsaasEmpresa(
  empresaId: string,
  opcoes: OpcoesConciliacaoAsaas = {},
): Promise<ResultadoConciliacaoEmpresa> {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, status: "ATIVA" },
    select: { id: true },
  });
  if (!empresa) return vazioEmpresa(empresaId);

  let http = opcoes.httpDaEmpresa?.(empresaId) ?? opcoes.http;
  if (!http) {
    try {
      http = (await abrirClienteAsaas(empresaId)).http;
    } catch (erro) {
      if (erro instanceof ErroAplicacao && erro.codigo === "asaas_nao_configurado") {
        return vazioEmpresa(empresaId, true);
      }
      throw erro;
    }
  }

  const agora = opcoes.agora ?? new Date();
  const manual = opcoes.manual ?? false;
  const pausaMs = opcoes.pausaMs ?? PAUSA_MS;
  const pausar = opcoes.pausar ?? pausaPadrao;
  const maxPaginas = opcoes.maxPaginas ?? (manual ? MAX_PAGINAS_MANUAL : MAX_PAGINAS_CRON);
  const limiteAbertas = opcoes.limiteAbertas ?? (manual ? LIMITE_ABERTAS_MANUAL : LIMITE_ABERTAS_CRON);
  const prazo = opcoes.prazoEm ?? Date.now() + (opcoes.prazoMs ?? (manual ? PRAZO_MANUAL_MS : PRAZO_CRON_MS));
  const hoje = dataHojeIso(agora);
  const desde = dataIsoValida(hoje) ? isoMenosDias(hoje, DIAS_RECENTES) : hoje;
  const desdeData = new Date(`${desde}T00:00:00.000Z`);

  const abertas = await prisma.fatura.findMany({
    where: ondeAberta(empresaId),
    select: { asaasPaymentId: true },
    orderBy: [{ vencimento: "asc" }, { id: "asc" }],
  });
  const idsAbertas = abertas.map((fatura) => fatura.asaasPaymentId).filter((id): id is string => Boolean(id));
  const paginas = Math.max(1, Math.ceil(idsAbertas.length / limiteAbertas));
  const indice = manual ? 0 : Math.floor(agora.getTime() / 86_400_000) % paginas;
  const fatiaAbertas = idsAbertas.slice(indice * limiteAbertas, (indice + 1) * limiteAbertas);

  const pagasRecentes = await prisma.fatura.findMany({
    where: {
      empresaId,
      excluida: false,
      asaasPaymentId: { not: null },
      pagoEm: { gte: desdeData },
      OR: [
        { statusNormalizado: STATUS_NORMALIZADO.PAGO },
        { status: { in: [...STATUS_PAGOS] } },
      ],
    },
    select: { asaasPaymentId: true },
    orderBy: { pagoEm: "desc" },
    take: limiteAbertas,
  });
  const idsPagas = pagasRecentes.map((fatura) => fatura.asaasPaymentId).filter((id): id is string => Boolean(id));

  const mapa = new Map<string, CobrancaAsaas>();
  const andamento: Andamento = {
    consultadas: 0,
    atualizadas: 0,
    criadas: 0,
    ignoradas: 0,
    falhas: 0,
    interrompida: false,
    naoAutorizado: false,
    listaIncompleta: false,
  };

  const faixas: Array<{ filtro: Omit<FiltroListaCobrancasAsaas, "offset" | "limit">; paginas: number; incompleta: boolean }> = [
    { filtro: { status: "RECEIVED", paymentDateGe: desde }, paginas: maxPaginas, incompleta: true },
    { filtro: { status: "CONFIRMED", paymentDateGe: desde }, paginas: maxPaginas, incompleta: true },
    { filtro: { status: "RECEIVED_IN_CASH", paymentDateGe: desde }, paginas: maxPaginas, incompleta: true },
    { filtro: { status: "REFUNDED", paymentDateGe: desde }, paginas: maxPaginas, incompleta: true },
    { filtro: { status: "REFUNDED" }, paginas: 1, incompleta: false },
    { filtro: { dateCreatedGe: desde }, paginas: maxPaginas, incompleta: true },
  ];
  for (let indiceFaixa = 0; indiceFaixa < faixas.length; indiceFaixa += 1) {
    if (andamento.interrompida) break;
    if (indiceFaixa > 0) await pausar(pausaMs);
    const faixa = faixas[indiceFaixa];
    await listarFaixa(http, faixa.filtro, mapa, andamento, faixa.paginas, pausaMs, pausar, prazo, faixa.incompleta);
  }

  if (!andamento.interrompida) {
    await consultarPorId(http, [...fatiaAbertas, ...idsPagas], mapa, andamento, prazo);
  }

  await aplicarMapa(empresaId, mapa, andamento, agora);

  const restantesAbertas = idsAbertas.filter((id) => !mapa.has(id)).length;
  return {
    empresaId,
    consultadas: andamento.consultadas,
    atualizadas: andamento.atualizadas,
    criadas: andamento.criadas,
    ignoradas: andamento.ignoradas,
    falhas: andamento.falhas,
    restantes: restantesAbertas + (andamento.listaIncompleta ? 1 : 0),
    interrompida: andamento.interrompida,
    naoAutorizado: andamento.naoAutorizado,
    semConfiguracao: false,
  };
}

export async function executarConciliacaoAsaas(
  opcoes: OpcoesConciliacaoAsaas = {},
): Promise<ResultadoConciliacaoAsaas> {
  const empresas = await prisma.empresa.findMany({
    where: { status: "ATIVA", asaas: { isNot: null } },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
  });
  const agora = opcoes.agora ?? new Date();
  const prazoEm = opcoes.prazoEm ?? Date.now() + (opcoes.prazoMs ?? PRAZO_CRON_MS);
  const compartilhada = { ...opcoes, prazoEm, agora };
  const inicio = empresas.length === 0 ? 0 : Math.floor(agora.getTime() / 86_400_000) % empresas.length;
  const ordem = [...empresas.slice(inicio), ...empresas.slice(0, inicio)];

  let consultadas = 0;
  let atualizadas = 0;
  let criadas = 0;
  let falhas = 0;
  let empresasComFalha = 0;
  let interrompidas = 0;

  for (const empresa of ordem) {
    if (Date.now() >= prazoEm) {
      interrompidas += 1;
      logAsaas("conciliacao_prazo", { empresaId: empresa.id });
      break;
    }
    try {
      const resultado = await conciliarAsaasEmpresa(empresa.id, compartilhada);
      consultadas += resultado.consultadas;
      atualizadas += resultado.atualizadas;
      criadas += resultado.criadas;
      falhas += resultado.falhas;
      if (resultado.interrompida) interrompidas += 1;
      if (resultado.naoAutorizado || resultado.semConfiguracao) {
        empresasComFalha += 1;
        logAsaasErro("conciliacao_empresa", {
          empresaId: empresa.id,
          erro: resultado.naoAutorizado ? "asaas_nao_autorizado" : "asaas_nao_configurado",
        });
      }
    } catch (erro) {
      empresasComFalha += 1;
      logAsaasErro("conciliacao_empresa", { empresaId: empresa.id, erro: mensagemLogAsaas(erro) });
    }
  }

  logAsaas("conciliacao", {
    empresas: empresas.length,
    consultadas,
    atualizadas,
    criadas,
    falhas,
    empresasComFalha,
    interrompidas,
  });
  return { empresas: empresas.length, consultadas, atualizadas, criadas, falhas, empresasComFalha, interrompidas };
}

function mensagemChaveRecusada() {
  return new ErroAplicacao(
    "O Asaas recusou a chave. Confira se ela é do mesmo ambiente escolhido, sandbox ou produção.",
    400,
    "asaas_nao_autorizado",
  );
}

// Um clique: concilia status de pagamento e, em seguida, marca visualizações.
// Se a lista de pagamentos já tomou o limite do Asaas, a visualização fica para o próximo clique.
export async function sincronizarAsaasDoAutor(
  autor: AutorEmpresa,
  opcoes: OpcoesConciliacaoAsaas & { httpVisualizacao?: ClienteHttpAsaas } = {},
): Promise<ResultadoAtualizacaoAsaas> {
  exigirAtualizarVisualizacoes(autor);
  const pagamentos = await conciliarAsaasEmpresa(autor.empresaId, { ...opcoes, manual: true });
  if (pagamentos.semConfiguracao) {
    throw new ErroAplicacao(
      "Configure o Asaas desta empresa antes de continuar.",
      409,
      "asaas_nao_configurado",
    );
  }
  const mudouPagamento = pagamentos.atualizadas + pagamentos.criadas > 0;
  if (pagamentos.naoAutorizado && !mudouPagamento) throw mensagemChaveRecusada();

  let marcadas = 0;
  let falhas = pagamentos.falhas;
  let restantes = pagamentos.restantes;
  let interrompida = pagamentos.interrompida;
  if (!pagamentos.interrompida) {
    try {
      const vistas = await sincronizarVisualizacoesEmpresa(autor.empresaId, {
        http: opcoes.httpVisualizacao ?? (opcoes.http as ClienteHttpAsaas | undefined),
        agora: opcoes.agora,
      });
      marcadas = vistas.marcadas;
      falhas += vistas.falhas;
      restantes += vistas.restantes;
      interrompida = vistas.interrompida;
    } catch (erro) {
      if (!mudouPagamento) throw erro;
      falhas += 1;
      logAsaasErro("conciliacao_visualizacao", {
        empresaId: autor.empresaId,
        erro: mensagemLogAsaas(erro),
      });
    }
  }

  return {
    atualizadas: pagamentos.atualizadas + pagamentos.criadas + marcadas,
    pagamentos: pagamentos.atualizadas + pagamentos.criadas,
    marcadas,
    interrompida,
    falhas,
    restantes,
  };
}
