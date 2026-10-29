import { formaCobrancaDe } from "@/lib/cobranca";
import { isoDeData } from "@/lib/data";
import { STATUS_ABERTAS, STATUS_PAGAS, STATUS_VENCIDAS } from "@/lib/fatura-situacao";
import { somenteDocumento } from "@/lib/documento";
import type { FaturaDTO, LembreteReguaDTO, ModoReguaCliente, SituacaoFatura, StatusLembrete } from "@/lib/tipos";
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

type FaturaComNomes = {
  id: string;
  clienteId: string;
  clienteServicoId: string | null;
  asaasPaymentId: string | null;
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
  atualizadoEm: Date;
  cliente: { nomeFantasia: string; whatsapp: string; email: string; reguaModo: string; reguaId: string | null };
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
    asaasPaymentId: fatura.asaasPaymentId ?? "",
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
    atualizadoEm: fatura.atualizadoEm.toISOString(),
    whatsapp: fatura.cliente.whatsapp,
    email: fatura.cliente.email,
    reguaModo: modoRegua(fatura.cliente.reguaModo),
    reguaId: fatura.cliente.reguaId,
    lembretes: (fatura.lembretes ?? []).map(paraLembrete),
  };
}

const includeNomes = {
  cliente: { select: { nomeFantasia: true, whatsapp: true, email: true, reguaModo: true, reguaId: true } },
  clienteServico: { select: { servico: { select: { nome: true } } } },
  lembretes: { orderBy: { criadoEm: "desc" as const }, take: 20 },
} as const;

function modoRegua(valor: string): ModoReguaCliente {
  if (valor === "ESPECIFICA" || valor === "NENHUMA") return valor;
  return "PADRAO";
}

function filtroSituacao(situacao: SituacaoFatura) {
  if (situacao === "todas") return { status: { not: "CRIANDO" } };
  if (situacao === "canceladas") return { excluida: true, status: { not: "CRIANDO" } };
  if (situacao === "vencidas") return { excluida: false, status: { in: [...STATUS_VENCIDAS] } };
  if (situacao === "pagas") return { excluida: false, status: { in: [...STATUS_PAGAS] } };
  return { excluida: false, status: { in: [...STATUS_ABERTAS, ...STATUS_VENCIDAS] } };
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

const STATUS_CRIANDO = "CRIANDO";
const TRAVA_EMISSAO_MS = 2 * 60 * 1000;

function conflitoUnico(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const meta = "meta" in erro ? (erro.meta as { target?: unknown } | undefined) : undefined;
  const alvo = meta?.target;
  const texto = `${Array.isArray(alvo) ? alvo.join(" ") : typeof alvo === "string" ? alvo : ""} ${
    "message" in erro && typeof erro.message === "string" ? erro.message : ""
  }`;
  return texto.includes("chave_idempotencia") || texto.includes("chaveIdempotencia") || texto.includes("criando");
}

function travaFresca(atualizadoEm: Date) {
  return Date.now() - atualizadoEm.getTime() < TRAVA_EMISSAO_MS;
}

async function completarCobranca(http: ClienteHttpAsaas, cobranca: CobrancaAsaas) {
  let linhaDigitavel: string | null = null;
  let pixCopiaCola: string | null = null;
  const forma = cobranca.formaCobranca;
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
  return { linhaDigitavel, pixCopiaCola };
}

async function carregarFatura(empresaId: string, id: string) {
  const fatura = await prisma.fatura.findFirst({
    where: { id, empresaId },
    include: includeNomes,
  });
  if (!fatura) throw new ErroAplicacao("Cobrança não encontrada.", 404, "nao_encontrado");
  return fatura;
}

async function gravarCobrancaNaFatura(
  empresaId: string,
  faturaId: string,
  cobranca: CobrancaAsaas,
  extras: { linhaDigitavel: string | null; pixCopiaCola: string | null },
) {
  await prisma.fatura.update({
    where: { id: faturaId },
    data: {
      asaasPaymentId: cobranca.id,
      valor: cobranca.valor,
      status: cobranca.status,
      formaCobranca: cobranca.formaCobranca,
      boletoUrl: cobranca.boletoUrl,
      linhaDigitavel: extras.linhaDigitavel,
      pixCopiaCola: extras.pixCopiaCola,
      faturaUrl: cobranca.faturaUrl,
      descricao: cobranca.descricao,
      excluida: cobranca.excluida,
      erroEmissao: null,
    },
  });
}

async function reservarFatura(dados: {
  empresaId: string;
  clienteId: string;
  clienteServicoId: string | null;
  chaveIdempotencia: string | undefined;
  valor: string;
  vencimento: string;
  formaCobranca: string;
  descricao: string | null;
}) {
  const base = {
    clienteServicoId: dados.clienteServicoId,
    valor: dados.valor,
    vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
    formaCobranca: dados.formaCobranca,
    descricao: dados.descricao,
    status: STATUS_CRIANDO,
    excluida: false,
    erroEmissao: null,
    asaasPaymentId: null as string | null,
  };
  if (dados.chaveIdempotencia) {
    const pelaChave = await prisma.fatura.findFirst({
      where: { empresaId: dados.empresaId, chaveIdempotencia: dados.chaveIdempotencia },
    });
    if (pelaChave) {
      if (pelaChave.asaasPaymentId && pelaChave.status !== STATUS_CRIANDO && !pelaChave.excluida) {
        return { fatura: pelaChave, dono: false };
      }
      if (pelaChave.status === STATUS_CRIANDO && travaFresca(pelaChave.atualizadoEm)) {
        return { fatura: pelaChave, dono: false };
      }
      const adotada = await prisma.fatura.update({
        where: { id: pelaChave.id },
        data: { ...base, chaveIdempotencia: dados.chaveIdempotencia },
      });
      return { fatura: adotada, dono: true };
    }
  }

  const criando = await prisma.fatura.findFirst({
    where: { empresaId: dados.empresaId, clienteId: dados.clienteId, status: STATUS_CRIANDO },
  });
  if (criando && travaFresca(criando.atualizadoEm)) return { fatura: criando, dono: false };
  if (criando) {
    const adotada = await prisma.fatura.update({
      where: { id: criando.id },
      data: { ...base, chaveIdempotencia: dados.chaveIdempotencia ?? criando.chaveIdempotencia },
    });
    return { fatura: adotada, dono: true };
  }

  try {
    const criada = await prisma.fatura.create({
      data: {
        empresaId: dados.empresaId,
        clienteId: dados.clienteId,
        chaveIdempotencia: dados.chaveIdempotencia,
        ...base,
      },
    });
    return { fatura: criada, dono: true };
  } catch (erro) {
    if (!conflitoUnico(erro)) throw erro;
    const deNovo =
      (dados.chaveIdempotencia
        ? await prisma.fatura.findFirst({
            where: { empresaId: dados.empresaId, chaveIdempotencia: dados.chaveIdempotencia },
          })
        : null) ??
      (await prisma.fatura.findFirst({
        where: { empresaId: dados.empresaId, clienteId: dados.clienteId, status: STATUS_CRIANDO },
      }));
    if (!deNovo) throw erro;
    return { fatura: deNovo, dono: false };
  }
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
  const descricao = dados.descricao?.trim() ? dados.descricao.trim() : null;

  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    await garantirClienteAsaas(autor.empresaId, cliente, http);
    const { fatura: reservada, dono } = await reservarFatura({
      empresaId: autor.empresaId,
      clienteId: cliente.id,
      clienteServicoId,
      chaveIdempotencia: dados.chaveIdempotencia,
      valor: dados.valor,
      vencimento: dados.vencimento,
      formaCobranca: forma,
      descricao,
    });

    if (reservada.asaasPaymentId && reservada.status !== STATUS_CRIANDO && !reservada.excluida) {
      return paraFatura(await carregarFatura(autor.empresaId, reservada.id));
    }

    const customer = await garantirClienteAsaas(autor.empresaId, cliente, http);
    let cobranca = await http.buscarCobrancaPorReferencia(reservada.id);
    if (!cobranca && !dono) {
      throw new ErroAplicacao(
        "Já existe uma cobrança sendo emitida para este cliente. Espere ela terminar antes de gerar outra.",
        409,
        "emissao_em_andamento",
      );
    }
    if (!cobranca) {
      try {
        cobranca = await http.criarCobranca({
          customer,
          formaCobranca: forma,
          valor: dados.valor,
          vencimento: dados.vencimento,
          descricao: descricao ?? undefined,
          referencia: reservada.id,
          encargos: encargosDaPreferencia(prefs),
        });
      } catch (erro) {
        cobranca = await http.buscarCobrancaPorReferencia(reservada.id).catch(() => null);
        if (!cobranca) {
          const incerto = asaasRespondeu(erro, 502) || asaasRespondeu(erro, 504);
          if (!incerto) {
            await prisma.fatura.update({
              where: { id: reservada.id },
              data: {
                status: "ERRO_EMISSAO",
                excluida: true,
                erroEmissao: mensagemLogAsaas(erro).slice(0, 500),
                chaveIdempotencia: null,
              },
            });
          }
          if (incerto) {
            throw new ErroAplicacao(
              "Não confirmamos a cobrança no Asaas. Nenhuma cobrança nova foi gerada. Espere um instante e tente de novo.",
              502,
              "emissao_incerta",
            );
          }
          throw erro;
        }
      }
    }

    const extras = await completarCobranca(http, cobranca);
    try {
      await gravarCobrancaNaFatura(autor.empresaId, reservada.id, cobranca, extras);
    } catch (erroGravacao) {
      try {
        await gravarCobrancaNaFatura(autor.empresaId, reservada.id, cobranca, extras);
      } catch {
        let cancelou = false;
        try {
          await http.cancelarCobranca(cobranca.id);
          cancelou = true;
        } catch (erroCancelamento) {
          logAsaasErro("falha ao cancelar cobrança órfã", {
            empresaId: autor.empresaId,
            clienteId: cliente.id,
            asaasPaymentId: cobranca.id,
            mensagem: mensagemLogAsaas(erroCancelamento),
          });
          try {
            await prisma.fatura.update({
              where: { id: reservada.id },
              data: {
                asaasPaymentId: cobranca.id,
                status: cobranca.status,
                boletoUrl: cobranca.boletoUrl,
                faturaUrl: cobranca.faturaUrl,
                erroEmissao: "A cobrança foi criada no Asaas e o cancelamento falhou. Ela ficou registrada para não gerar outra.",
              },
            });
          } catch (erroFinal) {
            logAsaasErro("falha ao registrar cobrança órfã", {
              empresaId: autor.empresaId,
              clienteId: cliente.id,
              asaasPaymentId: cobranca.id,
              mensagem: mensagemLogAsaas(erroFinal),
            });
          }
          throw new ErroAplicacao(
            `A cobrança ${cobranca.id} foi criada no Asaas e não pôde ser cancelada. Ela ficou registrada para não gerar outra. Confira o boleto antes de emitir de novo.`,
            502,
            "emissao_registrada",
          );
        }
        if (cancelou) {
          await prisma.fatura.update({
            where: { id: reservada.id },
            data: {
              asaasPaymentId: cobranca.id,
              status: "ERRO_EMISSAO",
              excluida: true,
              erroEmissao: "A cobrança foi criada no Asaas e o Taguaro não conseguiu gravá-la. O cancelamento foi pedido.",
              chaveIdempotencia: null,
            },
          });
          throw new ErroAplicacao(
            "A cobrança chegou a ser criada no Asaas e o Taguaro não conseguiu gravá-la. O cancelamento foi pedido. Confira no Asaas se o boleto foi cancelado antes de emitir de novo.",
            502,
            "emissao_cancelada",
          );
        }
        throw erroGravacao;
      }
    }

    logAsaas("fatura emitida", {
      empresaId: autor.empresaId,
      clienteId: cliente.id,
      asaasPaymentId: cobranca.id,
      forma,
    });
    return paraFatura(await carregarFatura(autor.empresaId, reservada.id));
  } catch (erro) {
    if (!(erro instanceof ErroAplicacao && erro.codigo === "emissao_em_andamento")) {
      logAsaasErro("falha ao emitir fatura", {
        empresaId: autor.empresaId,
        clienteId: cliente.id,
        mensagem: mensagemLogAsaas(erro),
      });
    }
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
  if (!atual.asaasPaymentId) {
    const fatura = await prisma.fatura.update({
      where: { id: atual.id },
      data: { excluida: true, status: "ERRO_EMISSAO" },
      include: includeNomes,
    });
    return paraFatura(fatura);
  }

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
