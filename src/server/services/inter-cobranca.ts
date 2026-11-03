import { formaCobrancaDe } from "@/lib/cobranca";
import { STATUS_NORMALIZADO } from "@/lib/status-pagamento";
import type { FaturaDTO } from "@/lib/tipos";
import { esquemaFatura } from "@/lib/validacao";
import { pagadorDoCliente } from "@/server/inter/pagador";
import { urlPdfFatura } from "@/server/inter/url-publica";
import { logInter, logInterErro } from "@/server/inter/log";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { espelhoFaturaInter } from "@/server/pagamentos/gravacao";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import type { CobrancaNormalizada } from "@/server/pagamentos/tipos";
import { lerEsquema } from "@/server/validar";
import { encargosDaPreferencia, obterPreferenciasCobranca } from "./preferencia-cobranca-service";

async function faturaPronta(autor: AutorEmpresa, id: string): Promise<FaturaDTO> {
  const { obterFatura } = await import("./fatura-service");
  return obterFatura(autor, id);
}

const STATUS_CRIANDO = "CRIANDO";
const TRAVA_EMISSAO_MS = 2 * 60 * 1000;

function travaFresca(atualizadoEm: Date) {
  return Date.now() - atualizadoEm.getTime() < TRAVA_EMISSAO_MS;
}

function conflitoUnico(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const mensagem = "message" in erro && typeof erro.message === "string" ? erro.message : "";
  return mensagem.includes("chave_idempotencia") || mensagem.includes("criando");
}

function dadosDaCobranca(faturaId: string, cobranca: CobrancaNormalizada) {
  const cancelada = cobranca.status === STATUS_NORMALIZADO.CANCELADO || cobranca.excluida;
  return {
    ...espelhoFaturaInter({ status: cobranca.statusBruto, idExterno: cobranca.idExterno }),
    valor: cobranca.valor,
    vencimento: new Date(`${cobranca.vencimento}T00:00:00.000Z`),
    status: cobranca.statusBruto,
    formaCobranca: "BOLETO",
    linhaDigitavel: cobranca.linhaDigitavel ?? null,
    pixCopiaCola: cobranca.pixCopiaCola ?? null,
    boletoUrl: urlPdfFatura(faturaId),
    descricao: cobranca.descricao,
    excluida: cancelada,
    pagoEm:
      cobranca.status === STATUS_NORMALIZADO.PAGO && cobranca.pagoEm
        ? new Date(`${cobranca.pagoEm}T00:00:00.000Z`)
        : cobranca.status === STATUS_NORMALIZADO.PAGO
          ? undefined
          : null,
    erroEmissao: null as string | null,
  };
}

export async function gravarCobrancaInter(empresaId: string, faturaId: string, cobranca: CobrancaNormalizada) {
  await prisma.fatura.updateMany({
    where: { id: faturaId, empresaId, provedor: "INTER" },
    data: dadosDaCobranca(faturaId, cobranca),
  });
}

async function reservar(dados: {
  empresaId: string;
  clienteId: string;
  clienteServicoId: string | null;
  chaveIdempotencia?: string;
  valor: string;
  vencimento: string;
  descricao: string | null;
}) {
  const base = {
    clienteServicoId: dados.clienteServicoId,
    valor: dados.valor,
    vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
    formaCobranca: "BOLETO",
    descricao: dados.descricao,
    status: STATUS_CRIANDO,
    ...espelhoFaturaInter({ status: STATUS_CRIANDO, idExterno: null }),
    excluida: false,
    erroEmissao: null,
    asaasPaymentId: null as string | null,
    chaveIdempotencia: dados.chaveIdempotencia ?? null,
  };
  const pelaChave = dados.chaveIdempotencia
    ? await prisma.fatura.findFirst({
        where: { empresaId: dados.empresaId, chaveIdempotencia: dados.chaveIdempotencia },
      })
    : null;
  if (pelaChave) {
    if (pelaChave.idExterno && pelaChave.status !== STATUS_CRIANDO && !pelaChave.excluida) {
      return { fatura: pelaChave, dono: false };
    }
    if (pelaChave.status === STATUS_CRIANDO && travaFresca(pelaChave.atualizadoEm)) {
      return { fatura: pelaChave, dono: false };
    }
    const adotada = await prisma.fatura.update({ where: { id: pelaChave.id }, data: base });
    return { fatura: adotada, dono: true };
  }
  const criando = await prisma.fatura.findFirst({
    where: { empresaId: dados.empresaId, clienteId: dados.clienteId, status: STATUS_CRIANDO },
  });
  if (criando && travaFresca(criando.atualizadoEm)) return { fatura: criando, dono: false };
  if (criando) {
    const adotada = await prisma.fatura.update({ where: { id: criando.id }, data: base });
    return { fatura: adotada, dono: true };
  }
  try {
    const criada = await prisma.fatura.create({
      data: { empresaId: dados.empresaId, clienteId: dados.clienteId, ...base },
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

export async function emitirFaturaInter(
  autor: AutorEmpresa,
  clienteId: string,
  entrada: unknown,
  clienteHttp?: ClienteHttpInter,
): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaFatura, entrada);
  if (formaCobrancaDe(dados.formaCobranca) === "CREDIT_CARD") {
    throw new ErroAplicacao("O Inter, nesta cobrança, não recebe cartão. Use boleto com Pix.", 422, "forma_indisponivel");
  }
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: autor.empresaId } });
  if (!cliente) throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  const pagador = pagadorDoCliente(cliente);

  let clienteServicoId: string | null = null;
  if (dados.clienteServicoId) {
    const vinculo = await prisma.clienteServico.findFirst({
      where: { id: dados.clienteServicoId, clienteId: cliente.id, empresaId: autor.empresaId },
      select: { id: true },
    });
    if (!vinculo) throw new ErroAplicacao("Esse serviço não está vendido a este cliente.", 404, "nao_encontrado");
    clienteServicoId = vinculo.id;
  }

  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  const descricao = dados.descricao?.trim() ? dados.descricao.trim() : null;
  const { fatura: reservada, dono } = await reservar({
    empresaId: autor.empresaId,
    clienteId: cliente.id,
    clienteServicoId,
    chaveIdempotencia: dados.chaveIdempotencia,
    valor: dados.valor,
    vencimento: dados.vencimento,
    descricao,
  });
  if (reservada.idExterno && reservada.status !== STATUS_CRIANDO && !reservada.excluida) {
    return faturaPronta(autor, reservada.id);
  }
  if (!dono && !reservada.idExterno) {
    throw new ErroAplicacao(
      "Já existe uma cobrança sendo emitida para este cliente. Espere ela terminar antes de gerar outra.",
      409,
      "emissao_em_andamento",
    );
  }

  try {
    const provedor = await provedorDaEmpresa(autor.empresaId, undefined, clienteHttp);
    const cobranca = await provedor.criarCobranca({
      idClienteExterno: cliente.id,
      formaCobranca: "BOLETO_PIX",
      valor: dados.valor,
      vencimento: dados.vencimento,
      descricao: descricao ?? undefined,
      chaveIdempotencia: dados.chaveIdempotencia ?? reservada.id,
      encargos: encargosDaPreferencia(prefs),
      pagador,
    });
    await gravarCobrancaInter(autor.empresaId, reservada.id, cobranca);
    logInter("fatura emitida", { empresaId: autor.empresaId, faturaId: reservada.id, idExterno: cobranca.idExterno });
    return faturaPronta(autor, reservada.id);
  } catch (erro) {
    const incerto = erro instanceof ErroAplicacao && (erro.status === 502 || erro.status === 504);
    if (!incerto && erro instanceof ErroAplicacao && erro.codigo !== "emissao_em_andamento") {
      await prisma.fatura.update({
        where: { id: reservada.id },
        data: {
          status: "ERRO_EMISSAO",
          ...espelhoFaturaInter({ status: "ERRO_EMISSAO" }),
          excluida: true,
          erroEmissao: erro.message.slice(0, 500),
          chaveIdempotencia: null,
        },
      });
    }
    logInterErro("falha ao emitir fatura", {
      empresaId: autor.empresaId,
      faturaId: reservada.id,
      codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
    });
    throw erro;
  }
}

export async function cancelarFaturaInter(
  autor: AutorEmpresa,
  faturaId: string,
  clienteHttp?: ClienteHttpInter,
): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const atual = await prisma.fatura.findFirst({ where: { id: faturaId, empresaId: autor.empresaId } });
  if (!atual) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  if (atual.excluida) return faturaPronta(autor, atual.id);
  if (atual.idExterno) {
    const provedor = await provedorDaEmpresa(autor.empresaId, undefined, clienteHttp);
    try {
      await provedor.cancelarCobranca(atual.idExterno, "Cancelada no Taguaro");
    } catch (erro) {
      if (!(erro instanceof ErroAplicacao && erro.status === 404)) throw erro;
    }
  }
  await prisma.fatura.update({
    where: { id: atual.id },
    data: {
      excluida: true,
      status: "CANCELADO",
      ...espelhoFaturaInter({ status: "CANCELADO", idExterno: atual.idExterno }),
    },
  });
  return faturaPronta(autor, atual.id);
}
