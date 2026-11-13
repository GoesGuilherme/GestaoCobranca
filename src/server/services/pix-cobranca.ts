import { randomBytes } from "node:crypto";
import { formaCobrancaDe } from "@/lib/cobranca";
import { dataHojeIso } from "@/lib/data";
import { montarBrCode } from "@/lib/pix-brcode";
import { caminhoPagamentoPix } from "@/lib/pix-link";
import type { FaturaDTO } from "@/lib/tipos";
import { esquemaBaixaManual, esquemaFatura } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { Prisma } from "@/generated/prisma/client";
import { espelhoFaturaPix } from "@/server/pagamentos/gravacao";
import { lerEsquema } from "@/server/validar";
import { enfileirarPagoWhatsapp } from "./whatsapp-fila";
import { pagamentoDentroDaJanelaWhatsapp } from "./whatsapp-pago";

const ABERTAS = ["EM_ABERTO", "VENCIDA"] as const;

export function novoTokenPublico(): string {
  return randomBytes(32).toString("base64url");
}

export function novoTxidPix(): string {
  return randomBytes(13).toString("hex").slice(0, 25);
}

async function faturaPronta(autor: AutorEmpresa, id: string): Promise<FaturaDTO> {
  const { obterFatura } = await import("./fatura-service");
  return obterFatura(autor, id);
}

async function chaveDaEmpresa(empresaId: string) {
  const config = await prisma.configuracaoPixProprio.findUnique({ where: { empresaId } });
  if (!config?.ativo) {
    throw new ErroAplicacao("Cadastre a chave Pix da empresa em Banco antes de emitir.", 422, "pix_nao_configurado");
  }
  return config;
}

export function payloadPix(config: { chavePix: string; nomeRecebedor: string; cidadeRecebedor: string }, dados: {
  valor: string;
  txid: string;
  descricao?: string | null;
}): string {
  return montarBrCode({
    chave: config.chavePix,
    nomeRecebedor: config.nomeRecebedor,
    cidadeRecebedor: config.cidadeRecebedor,
    valor: dados.valor,
    txid: dados.txid,
    descricao: dados.descricao,
  });
}

export function statusPixPelaData(vencimento: string, hoje = dataHojeIso()): "EM_ABERTO" | "VENCIDA" {
  return vencimento < hoje ? "VENCIDA" : "EM_ABERTO";
}

export async function sincronizarVencidasPix(empresaId?: string, agora = new Date()) {
  const hoje = dataHojeIso(agora);
  await prisma.fatura.updateMany({
    where: {
      provedor: "PIX_DIRETO",
      status: "EM_ABERTO",
      excluida: false,
      vencimento: { lt: new Date(`${hoje}T00:00:00.000Z`) },
      ...(empresaId ? { empresaId } : {}),
    },
    data: { status: "VENCIDA", ...espelhoFaturaPix({ status: "VENCIDA" }) },
  });
}

export async function emitirFaturaPix(autor: AutorEmpresa, clienteId: string, entrada: unknown): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaFatura, entrada);
  if (dados.formaCobranca && formaCobrancaDe(dados.formaCobranca) !== "PIX") {
    throw new ErroAplicacao("O Pix da empresa só emite cobrança Pix.", 422, "forma_indisponivel");
  }
  const config = await chaveDaEmpresa(autor.empresaId);
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: autor.empresaId } });
  if (!cliente) throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");

  let clienteServicoId: string | null = null;
  if (dados.clienteServicoId) {
    const vinculo = await prisma.clienteServico.findFirst({
      where: { id: dados.clienteServicoId, clienteId: cliente.id, empresaId: autor.empresaId },
      select: { id: true },
    });
    if (!vinculo) throw new ErroAplicacao("Esse serviço não está vendido a este cliente.", 404, "nao_encontrado");
    clienteServicoId = vinculo.id;
  }

  if (dados.chaveIdempotencia) {
    const existente = await prisma.fatura.findFirst({
      where: { empresaId: autor.empresaId, chaveIdempotencia: dados.chaveIdempotencia },
    });
    if (existente?.pixCopiaCola && !existente.excluida && existente.provedor === "PIX_DIRETO") {
      return faturaPronta(autor, existente.id);
    }
  }

  const descricao = dados.descricao?.trim() ? dados.descricao.trim() : null;
  const txid = novoTxidPix();
  const token = novoTokenPublico();
  const caminho = caminhoPagamentoPix(token);
  if (!caminho) throw new ErroAplicacao("Não foi possível reservar o link da cobrança.", 500, "pix_token");
  const status = statusPixPelaData(dados.vencimento);
  const pixCopiaCola = payloadPix(config, { valor: dados.valor, txid, descricao });

  const criada = await prisma.fatura.create({
    data: {
      empresaId: autor.empresaId,
      clienteId: cliente.id,
      clienteServicoId,
      chaveIdempotencia: dados.chaveIdempotencia ?? null,
      valor: dados.valor,
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      formaCobranca: "PIX",
      descricao,
      status,
      ...espelhoFaturaPix({ status, idExterno: txid }),
      pixCopiaCola,
      faturaUrl: caminho,
      tokenPublico: token,
      boletoUrl: null,
      linhaDigitavel: null,
      excluida: false,
      erroEmissao: null,
      asaasPaymentId: null,
    },
  });
  return faturaPronta(autor, criada.id);
}

export async function cancelarFaturaPix(autor: AutorEmpresa, faturaId: string): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const atual = await prisma.fatura.findFirst({ where: { id: faturaId, empresaId: autor.empresaId } });
  if (!atual || atual.provedor !== "PIX_DIRETO") {
    throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  }
  if (atual.excluida) return faturaPronta(autor, atual.id);
  if (atual.status === "PAGA" || atual.status === "RECEIVED" || atual.statusNormalizado === "PAGO") {
    throw new ErroAplicacao("Cobrança paga não pode ser cancelada por aqui.", 409, "fatura_paga");
  }
  const marcado = await prisma.fatura.updateMany({
    where: { id: atual.id, empresaId: autor.empresaId, provedor: "PIX_DIRETO", excluida: false },
    data: {
      excluida: true,
      status: "CANCELADA",
      ...espelhoFaturaPix({ status: "CANCELADA", idExterno: atual.idExterno }),
    },
  });
  if (marcado.count !== 1) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  return faturaPronta(autor, atual.id);
}

export async function regerarBrCodePix(
  empresaId: string,
  faturaId: string,
  nova: { valor: string; vencimento: string; descricao: string | null },
) {
  const config = await chaveDaEmpresa(empresaId);
  const txid = novoTxidPix();
  const status = statusPixPelaData(nova.vencimento);
  const pixCopiaCola = payloadPix(config, { valor: nova.valor, txid, descricao: nova.descricao });
  const marcado = await prisma.fatura.updateMany({
    where: {
      id: faturaId,
      empresaId,
      provedor: "PIX_DIRETO",
      excluida: false,
      status: { in: [...ABERTAS] },
    },
    data: {
      valor: nova.valor,
      vencimento: new Date(`${nova.vencimento}T00:00:00.000Z`),
      descricao: nova.descricao,
      status,
      pixCopiaCola,
      erroEmissao: null,
      ...espelhoFaturaPix({ status, idExterno: txid }),
    },
  });
  if (marcado.count !== 1) {
    throw new ErroAplicacao("Só dá para alterar cobrança Pix em aberto ou vencida.", 422, "fatura_fechada");
  }
}

// A transação só usa `tx`. WhatsApp e leitura seguinte ficam fora, com o prisma global.
export async function liquidarFaturaPix(
  autor: AutorEmpresa & { usuarioId?: string },
  faturaId: string,
  dados: {
    pagoEm: string;
    nota: string | null;
    origem: "MANUAL" | "OFX";
    referenciaExterna?: string | null;
  },
  agora = new Date(),
  gravarExtra?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  exigirCobranca(autor);
  const hoje = dataHojeIso(agora);
  if (dados.pagoEm > hoje) {
    throw new ErroAplicacao("A data do pagamento não pode ser futura.", 400, "data_futura");
  }
  const pagoEm = new Date(`${dados.pagoEm}T00:00:00.000Z`);
  const baixou = await prisma.$transaction(async (tx) => {
    const marcado = await tx.fatura.updateMany({
      where: {
        id: faturaId,
        empresaId: autor.empresaId,
        provedor: "PIX_DIRETO",
        excluida: false,
        status: { in: [...ABERTAS] },
      },
      data: {
        status: "PAGA",
        pagoEm,
        ...espelhoFaturaPix({ status: "PAGA" }),
      },
    });
    if (marcado.count !== 1) return false;
    await tx.conciliacaoPagamento.create({
      data: {
        empresaId: autor.empresaId,
        faturaId,
        origem: dados.origem,
        pagoEm,
        nota: dados.nota,
        usuarioId: autor.usuarioId ?? null,
        referenciaExterna: dados.referenciaExterna ?? null,
      },
    });
    if (gravarExtra) await gravarExtra(tx);
    return true;
  });
  if (!baixou) return false;

  const avisa =
    dados.origem === "MANUAL" || pagamentoDentroDaJanelaWhatsapp({ clientPaymentDate: dados.pagoEm }, agora);
  if (!avisa) return true;

  const fatura = await prisma.fatura.findFirst({
    where: { id: faturaId, empresaId: autor.empresaId },
    include: {
      cliente: {
        select: {
          id: true,
          nomeFantasia: true,
          whatsapp: true,
          status: true,
          reguaModo: true,
          reguaPausada: true,
        },
      },
    },
  });
  if (fatura) {
    const regua = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
    await enfileirarPagoWhatsapp(prisma, fatura, regua?.modoTeste ?? true, agora);
  }
  return true;
}

export async function marcarFaturaPixPaga(
  autor: AutorEmpresa & { usuarioId?: string },
  faturaId: string,
  entrada: unknown,
  agora = new Date(),
): Promise<FaturaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaBaixaManual, entrada);
  const nota = dados.nota?.trim() ? dados.nota.trim() : null;
  const baixou = await liquidarFaturaPix(
    autor,
    faturaId,
    { pagoEm: dados.pagoEm, nota, origem: "MANUAL" },
    agora,
  );
  if (!baixou) {
    throw new ErroAplicacao("Só dá para marcar como pago uma cobrança Pix em aberto ou vencida.", 409, "fatura_fechada");
  }
  return faturaPronta(autor, faturaId);
}
