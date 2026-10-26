import { formaCobrancaDe } from "@/lib/cobranca";
import { isoDeData } from "@/lib/data";
import { somenteDocumento } from "@/lib/documento";
import type { FaturaDTO, LembreteReguaDTO, SituacaoFatura, StatusLembrete } from "@/lib/tipos";
import { esquemaFatura } from "@/lib/validacao";
import { abrirClienteAsaas, asaasRespondeu, traduzirErroAsaas } from "@/server/asaas/abrir";
import { type ClienteHttpAsaas, type CobrancaAsaas, type PaginaCobrancasAsaas } from "@/server/asaas/contrato";
import { logAsaas, logAsaasErro, mensagemLogAsaas } from "@/server/asaas/log";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca, exigirVerFaturas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { espelharCobrancaImportada } from "./asaas-pagamento";
import { encargosDaPreferencia, obterPreferenciasCobranca } from "./preferencia-cobranca-service";

const ABERTAS = ["PENDING", "AWAITING_RISK_ANALYSIS"];
const VENCIDAS = ["OVERDUE", "DUNNING_REQUESTED"];
const PAGAS = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"];

type FaturaComNomes = {
  id: string;
  clienteId: string;
  clienteServicoId: string | null;
  asaasPaymentId: string;
  valor: { toFixed(casas: number): string };
  vencimento: Date;
  status: string;
  formaCobranca: string;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  faturaUrl: string | null;
  descricao: string | null;
  excluida: boolean;
  cliente: { nomeFantasia: string; whatsapp: string; email: string };
  clienteServico: { servico: { nome: string } } | null;
  lembretes?: {
    id: string;
    passoId: string | null;
    canal: string;
    status: string;
    motivo: string | null;
    destino: string | null;
    automatico: boolean;
    modoTeste: boolean;
    rotulo: string;
    criadoEm: Date;
  }[];
};

function statusLembrete(valor: string): StatusLembrete {
  if (valor === "ENVIADO" || valor === "FALHOU" || valor === "IGNORADO") return valor;
  return "FALHOU";
}

function paraLembrete(lembrete: NonNullable<FaturaComNomes["lembretes"]>[number]): LembreteReguaDTO {
  return {
    id: lembrete.id,
    passoId: lembrete.passoId,
    canal: lembrete.canal,
    status: statusLembrete(lembrete.status),
    motivo: lembrete.motivo,
    destino: lembrete.destino,
    automatico: lembrete.automatico,
    modoTeste: lembrete.modoTeste,
    rotulo: lembrete.rotulo,
    criadoEm: lembrete.criadoEm.toISOString(),
  };
}

function paraFatura(fatura: FaturaComNomes): FaturaDTO {
  return {
    id: fatura.id,
    clienteId: fatura.clienteId,
    nomeCliente: fatura.cliente.nomeFantasia,
    clienteServicoId: fatura.clienteServicoId,
    nomeServico: fatura.clienteServico?.servico.nome ?? null,
    asaasPaymentId: fatura.asaasPaymentId,
    valor: fatura.valor.toFixed(2),
    vencimento: isoDeData(fatura.vencimento),
    status: fatura.status,
    formaCobranca: fatura.formaCobranca,
    boletoUrl: fatura.boletoUrl,
    linhaDigitavel: fatura.linhaDigitavel,
    pixCopiaCola: fatura.pixCopiaCola,
    faturaUrl: fatura.faturaUrl,
    descricao: fatura.descricao,
    excluida: fatura.excluida,
    whatsapp: fatura.cliente.whatsapp,
    email: fatura.cliente.email,
    lembretes: (fatura.lembretes ?? []).map(paraLembrete),
  };
}

const includeNomes = {
  cliente: { select: { nomeFantasia: true, whatsapp: true, email: true } },
  clienteServico: { select: { servico: { select: { nome: true } } } },
  lembretes: { orderBy: { criadoEm: "desc" as const }, take: 20 },
} as const;

function filtroSituacao(situacao: SituacaoFatura) {
  if (situacao === "todas") return {};
  if (situacao === "canceladas") return { excluida: true };
  if (situacao === "vencidas") return { excluida: false, status: { in: VENCIDAS } };
  if (situacao === "pagas") return { excluida: false, status: { in: PAGAS } };
  return { excluida: false, status: { in: [...ABERTAS, ...VENCIDAS] } };
}

export async function listarFaturas(
  autor: AutorEmpresa,
  filtro: { situacao?: SituacaoFatura; busca?: string; clienteId?: string; ordem?: "asc" | "desc" } = {},
): Promise<FaturaDTO[]> {
  exigirVerFaturas(autor);
  const busca = filtro.busca?.trim() ?? "";
  const faturas = await prisma.fatura.findMany({
    where: {
      empresaId: autor.empresaId,
      ...filtroSituacao(filtro.situacao ?? "em_aberto"),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(busca
        ? {
            OR: [
              { cliente: { nomeFantasia: { contains: busca, mode: "insensitive" } } },
              { cliente: { razaoSocial: { contains: busca, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: includeNomes,
    orderBy: [{ vencimento: filtro.ordem ?? "asc" }, { criadoEm: "desc" }],
    take: 200,
  });
  return faturas.map(paraFatura);
}

export async function garantirClienteAsaas(
  empresaId: string,
  cliente: {
    id: string;
    asaasCustomerId: string | null;
    documento: string;
    razaoSocial: string;
    nomeFantasia: string;
    email: string;
    whatsapp: string;
  },
  http: ClienteHttpAsaas,
) {
  if (cliente.asaasCustomerId) {
    const conhecido = await http.obterCliente(cliente.asaasCustomerId);
    if (conhecido) return cliente.asaasCustomerId;
  }
  const documento = somenteDocumento(cliente.documento);
  const existente = await http.buscarClientePorDocumento(documento);
  const remoto =
    existente ??
    (await http.criarCliente({
      nome: cliente.razaoSocial || cliente.nomeFantasia,
      cpfCnpj: documento,
      email: cliente.email || undefined,
      telefone: cliente.whatsapp || undefined,
      referencia: cliente.id,
    }));
  if (remoto.id === cliente.asaasCustomerId) return remoto.id;
  const gravado = await prisma.cliente.updateMany({
    where: { id: cliente.id, empresaId },
    data: { asaasCustomerId: remoto.id },
  });
  if (gravado.count === 1) return remoto.id;
  const atual = await prisma.cliente.findFirst({
    where: { id: cliente.id, empresaId },
    select: { asaasCustomerId: true },
  });
  if (atual?.asaasCustomerId) return atual.asaasCustomerId;
  throw new ErroAplicacao("Não foi possível vincular o cliente ao Asaas.", 409, "asaas_cliente");
}

export async function emitirFatura(
  autor: AutorEmpresa,
  clienteId: string,
  entrada: unknown,
  clienteHttp?: ClienteHttpAsaas,
): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaFatura, entrada);
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId: autor.empresaId },
  });
  if (!cliente) throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");

  let clienteServicoId: string | null = null;
  if (dados.clienteServicoId) {
    const vinculo = await prisma.clienteServico.findFirst({
      where: { id: dados.clienteServicoId, clienteId: cliente.id, empresaId: autor.empresaId },
      select: { id: true },
    });
    if (!vinculo) {
      throw new ErroAplicacao("Esse serviço não está vendido a este cliente.", 404, "nao_encontrado");
    }
    clienteServicoId = vinculo.id;
  }

  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  const forma = formaCobrancaDe(dados.formaCobranca ?? prefs.formaCobranca);
  const descricao = dados.descricao?.trim() ? dados.descricao.trim() : undefined;

  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const customer = await garantirClienteAsaas(autor.empresaId, cliente, http);
    const cobranca = await http.criarCobranca({
      customer,
      formaCobranca: forma,
      valor: dados.valor,
      vencimento: dados.vencimento,
      descricao,
      referencia: cliente.id,
      encargos: encargosDaPreferencia(prefs),
    });

    let linhaDigitavel: string | null = null;
    let pixCopiaCola: string | null = null;
    if (forma === "BOLETO" || forma === "UNDEFINED") {
      try {
        linhaDigitavel = await http.obterLinhaDigitavel(cobranca.id);
      } catch {
        linhaDigitavel = null;
      }
    }
    if (forma === "PIX" || forma === "UNDEFINED") {
      try {
        pixCopiaCola = await http.obterPix(cobranca.id);
      } catch {
        pixCopiaCola = null;
      }
    }

    try {
      const fatura = await prisma.fatura.create({
        data: {
          empresaId: autor.empresaId,
          clienteId: cliente.id,
          clienteServicoId,
          asaasPaymentId: cobranca.id,
          valor: cobranca.valor,
          vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
          status: cobranca.status,
          formaCobranca: cobranca.formaCobranca,
          boletoUrl: cobranca.boletoUrl,
          linhaDigitavel,
          pixCopiaCola,
          faturaUrl: cobranca.faturaUrl,
          descricao: cobranca.descricao,
          excluida: cobranca.excluida,
        },
        include: includeNomes,
      });
      logAsaas("fatura emitida", {
        empresaId: autor.empresaId,
        clienteId: cliente.id,
        asaasPaymentId: cobranca.id,
        forma,
      });
      return paraFatura(fatura);
    } catch (erro) {
      await http.cancelarCobranca(cobranca.id).catch(() => undefined);
      throw erro;
    }
  } catch (erro) {
    logAsaasErro("falha ao emitir fatura", {
      empresaId: autor.empresaId,
      clienteId: cliente.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

export async function cancelarFatura(
  autor: AutorEmpresa,
  faturaId: string,
  clienteHttp?: ClienteHttpAsaas,
): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const atual = await prisma.fatura.findFirst({
    where: { id: faturaId, empresaId: autor.empresaId },
    include: includeNomes,
  });
  if (!atual) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  if (atual.excluida) return paraFatura(atual);

  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    try {
      await http.cancelarCobranca(atual.asaasPaymentId);
    } catch (erro) {
      if (!asaasRespondeu(erro, 404)) throw erro;
    }
  } catch (erro) {
    traduzirErroAsaas(erro);
  }

  const fatura = await prisma.fatura.update({
    where: { id: atual.id },
    data: { excluida: true },
    include: includeNomes,
  });
  return paraFatura(fatura);
}

const LIMITE_PAGINA = 100;
const MAX_PAGINAS = 5;
const ABERTAS_RECORRENTES = ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS", "DUNNING_REQUESTED"];

function registroDeCobranca(cobranca: CobrancaAsaas): Record<string, unknown> {
  return {
    id: cobranca.id,
    customer: cobranca.customer,
    subscription: cobranca.subscription,
    value: cobranca.valor,
    dueDate: cobranca.vencimento,
    status: cobranca.status,
    billingType: cobranca.formaCobranca,
    bankSlipUrl: cobranca.boletoUrl,
    invoiceUrl: cobranca.faturaUrl,
    description: cobranca.descricao,
    deleted: cobranca.excluida,
    ...(cobranca.cartao
      ? { creditCard: { creditCardBrand: cobranca.cartao.bandeira, creditCardNumber: cobranca.cartao.final } }
      : {}),
  };
}

async function coletarCobrancas(buscar: (offset: number) => Promise<PaginaCobrancasAsaas>) {
  const todas: CobrancaAsaas[] = [];
  let offset = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const lote = await buscar(offset);
    todas.push(...lote.cobrancas);
    if (!lote.temMais || lote.cobrancas.length === 0) break;
    offset += lote.cobrancas.length;
  }
  return todas;
}

export async function gravarCobrancasEspelhadas(empresaId: string, cobrancas: CobrancaAsaas[]) {
  const mapa = new Map<string, CobrancaAsaas>();
  for (const cobranca of cobrancas) {
    const anterior = mapa.get(cobranca.id);
    if (!anterior || (!anterior.subscription && cobranca.subscription)) mapa.set(cobranca.id, cobranca);
  }
  let criadas = 0;
  let atualizadas = 0;
  let ignoradas = 0;
  for (const cobranca of mapa.values()) {
    const resultado = await espelharCobrancaImportada(empresaId, registroDeCobranca(cobranca));
    if (resultado === "criada") criadas += 1;
    else if (resultado === "atualizada") atualizadas += 1;
    else ignoradas += 1;
  }
  return { criadas, atualizadas, ignoradas };
}

export async function importarFaturas(autor: AutorEmpresa, clienteHttp?: ClienteHttpAsaas) {
  exigirCobranca(autor);
  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const clientes = await prisma.cliente.findMany({
      where: { empresaId: autor.empresaId, asaasCustomerId: { not: null } },
      select: { asaasCustomerId: true },
    });
    const assinaturas = await prisma.clienteServico.findMany({
      where: { empresaId: autor.empresaId, asaasSubscriptionId: { not: null } },
      select: { asaasSubscriptionId: true },
    });
    const cobrancas: CobrancaAsaas[] = [];
    for (const cliente of clientes) {
      if (!cliente.asaasCustomerId) continue;
      cobrancas.push(
        ...(await coletarCobrancas((offset) => http.listarCobrancasDoCliente(cliente.asaasCustomerId!, offset, LIMITE_PAGINA))),
      );
    }
    for (const assinatura of assinaturas) {
      if (!assinatura.asaasSubscriptionId) continue;
      try {
        cobrancas.push(
          ...(await coletarCobrancas((offset) =>
            http.listarCobrancasDaAssinatura(assinatura.asaasSubscriptionId!, offset, LIMITE_PAGINA),
          )),
        );
      } catch (erro) {
        if (!asaasRespondeu(erro, 404)) throw erro;
      }
    }
    const resultado = await gravarCobrancasEspelhadas(autor.empresaId, cobrancas);
    logAsaas("faturas importadas", {
      empresaId: autor.empresaId,
      criadas: resultado.criadas,
      atualizadas: resultado.atualizadas,
      ignoradas: resultado.ignoradas,
    });
    return resultado;
  } catch (erro) {
    logAsaasErro("falha ao importar faturas", {
      empresaId: autor.empresaId,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

export async function marcarFaturasAbertasExcluidas(empresaId: string, clienteServicoId: string) {
  await prisma.fatura.updateMany({
    where: {
      empresaId,
      clienteServicoId,
      excluida: false,
      status: { in: ABERTAS_RECORRENTES },
    },
    data: { excluida: true },
  });
}

export async function atualizarFaturasAbertasDaAssinatura(
  empresaId: string,
  clienteServicoId: string,
  dados: { valor: string; formaCobranca: string; descricao: string | null },
) {
  await prisma.fatura.updateMany({
    where: {
      empresaId,
      clienteServicoId,
      excluida: false,
      status: { in: ABERTAS_RECORRENTES },
    },
    data: {
      valor: dados.valor,
      formaCobranca: dados.formaCobranca,
      ...(dados.descricao ? { descricao: dados.descricao } : {}),
    },
  });
}
