import { createHash } from "node:crypto";
import {
  alertasDoComprovante,
  escolherFaturaDoComprovante,
  dentroDaJanelaComprovante,
  TEXTO_COMPROVANTE_RECEBIDO,
  type AlertaComprovante,
  type ExtracaoComprovante,
} from "@/lib/comprovante";
import { dataHojeIso, isoDeData } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { exigirDono } from "@/server/auth/acesso";
import type { Acesso } from "@/server/auth/acesso";
import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { analisarComprovantePadrao, mimeDeComprovante } from "@/server/comprovante/analisar";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { faturaAceitaBaixaManual } from "@/lib/baixa-manual";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";
import { urlWebhookTwilio } from "@/server/twilio/fabrica";
import { darBaixaManual } from "./baixa-manual";

const LIMITE_BYTES = 5 * 1024 * 1024;

export type ComprovanteDTO = {
  id: string;
  faturaId: string | null;
  clienteId: string | null;
  nomeCliente: string | null;
  valorFatura: string | null;
  vencimentoFatura: string | null;
  mime: string;
  valorExtraido: string | null;
  pagoEm: string | null;
  hora: string | null;
  pagador: string | null;
  recebedorNome: string | null;
  recebedorDocumento: string | null;
  recebedorChave: string | null;
  e2e: string | null;
  alertas: AlertaComprovante[];
  situacao: string;
  motivoRejeicao: string | null;
  caminho: string;
};

function hashDe(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function alertasDe(valor: unknown): AlertaComprovante[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is AlertaComprovante => typeof item === "string");
}

function paraDto(linha: {
  id: string;
  faturaId: string | null;
  clienteId: string | null;
  mime: string;
  valorExtraido: { toFixed(casas: number): string } | null;
  pagoEm: Date | null;
  hora: string | null;
  pagador: string | null;
  recebedorNome: string | null;
  recebedorDocumento: string | null;
  recebedorChave: string | null;
  e2e: string | null;
  alertas: unknown;
  situacao: string;
  motivoRejeicao: string | null;
  cliente: { nomeFantasia: string } | null;
  fatura: { valor: { toFixed(casas: number): string }; vencimento: Date } | null;
}): ComprovanteDTO {
  return {
    id: linha.id,
    faturaId: linha.faturaId,
    clienteId: linha.clienteId,
    nomeCliente: linha.cliente?.nomeFantasia ?? null,
    valorFatura: linha.fatura ? linha.fatura.valor.toFixed(2) : null,
    vencimentoFatura: linha.fatura ? isoDeData(linha.fatura.vencimento) : null,
    mime: linha.mime,
    valorExtraido: linha.valorExtraido ? linha.valorExtraido.toFixed(2) : null,
    pagoEm: linha.pagoEm ? isoDeData(linha.pagoEm) : null,
    hora: linha.hora,
    pagador: linha.pagador,
    recebedorNome: linha.recebedorNome,
    recebedorDocumento: linha.recebedorDocumento,
    recebedorChave: linha.recebedorChave,
    e2e: linha.e2e,
    alertas: alertasDe(linha.alertas),
    situacao: linha.situacao,
    motivoRejeicao: linha.motivoRejeicao,
    caminho: `/api/comprovantes/${linha.id}`,
  };
}

const includeLista = {
  cliente: { select: { nomeFantasia: true } },
  fatura: { select: { valor: true, vencimento: true } },
} as const;

export async function salvarLeituraComprovantes(acesso: Acesso, ativo: boolean) {
  exigirDono(acesso);
  await prisma.empresa.update({
    where: { id: acesso.empresaId },
    data: { lerComprovantesWhatsapp: ativo },
  });
  return { ativo };
}

export async function leituraComprovantesDaEmpresa(empresaId: string): Promise<boolean> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { lerComprovantesWhatsapp: true },
  });
  return empresa?.lerComprovantesWhatsapp === true;
}

export async function listarComprovantesPendentes(autor: AutorEmpresa): Promise<ComprovanteDTO[]> {
  exigirCobranca(autor);
  const linhas = await prisma.comprovantePagamento.findMany({
    where: { empresaId: autor.empresaId, situacao: { in: ["PENDENTE", "SEM_FATURA"] } },
    include: includeLista,
    orderBy: { criadoEm: "desc" },
    take: 30,
  });
  return linhas.map(paraDto);
}

export async function comprovantePendenteDaFatura(autor: AutorEmpresa, faturaId: string): Promise<ComprovanteDTO | null> {
  exigirCobranca(autor);
  const linha = await prisma.comprovantePagamento.findFirst({
    where: { empresaId: autor.empresaId, faturaId, situacao: "PENDENTE" },
    include: includeLista,
    orderBy: { criadoEm: "desc" },
  });
  return linha ? paraDto(linha) : null;
}

export async function lerMidiaComprovante(autor: AutorEmpresa, id: string) {
  exigirCobranca(autor);
  const linha = await prisma.comprovantePagamento.findFirst({
    where: { id, empresaId: autor.empresaId },
    select: { conteudo: true, mime: true },
  });
  if (!linha) throw new ErroAplicacao("Comprovante não encontrado.", 404, "nao_encontrado");
  return { bytes: new Uint8Array(linha.conteudo), mime: linha.mime };
}

async function clientePeloTelefone(empresaId: string, de: string) {
  const digitos = digitosWhatsapp(de.replace(/^whatsapp:/i, ""));
  if (!digitos) return null;
  const clientes = await prisma.cliente.findMany({
    where: { empresaId },
    select: { id: true, whatsapp: true },
  });
  return clientes.find((cliente) => digitosWhatsapp(cliente.whatsapp) === digitos) ?? null;
}

export async function registrarComprovanteRecebido(dados: {
  empresaId: string;
  messageSid: string;
  de: string;
  para: string | null;
  bytes: Uint8Array;
  mime: string;
  agora?: Date;
  analisar?: (bytes: Uint8Array, mime: string) => Promise<ExtracaoComprovante>;
  twilio?: ClienteTwilio;
  conta?: CredencialTwilio;
}): Promise<{ gravado: boolean; situacao: string | null }> {
  const ligado = await leituraComprovantesDaEmpresa(dados.empresaId);
  if (!ligado) return { gravado: false, situacao: null };
  const mime = mimeDeComprovante(dados.mime);
  if (!mime || dados.bytes.byteLength === 0 || dados.bytes.byteLength > LIMITE_BYTES) {
    return { gravado: false, situacao: null };
  }
  const agora = dados.agora ?? new Date();
  const analisar = dados.analisar ?? ((bytes, tipo) => analisarComprovantePadrao(bytes, tipo));
  const extraido = await analisar(dados.bytes, mime);
  if (!extraido.parece) return { gravado: false, situacao: null };

  const hash = hashDe(dados.bytes);
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: dados.empresaId },
    select: { nomeFantasia: true, razaoSocial: true, cnpj: true },
  });
  const pix = await prisma.configuracaoPixProprio.findUnique({
    where: { empresaId: dados.empresaId },
    select: { chavePix: true },
  });
  const cliente = await clientePeloTelefone(dados.empresaId, dados.de);
  const faturas = cliente
    ? await prisma.fatura.findMany({
        where: { empresaId: dados.empresaId, clienteId: cliente.id, excluida: false },
        select: { id: true, valor: true, vencimento: true, criadoEm: true, status: true, excluida: true, provedor: true },
      })
    : [];
  const escolha = escolherFaturaDoComprovante(
    faturas.map((fatura) => ({
      id: fatura.id,
      valor: fatura.valor.toFixed(2),
      vencimento: isoDeData(fatura.vencimento),
      criadoEm: fatura.criadoEm.toISOString(),
      status: fatura.status,
      excluida: fatura.excluida,
      provedor: fatura.provedor,
    })),
    extraido,
  );
  const fatura = escolha.faturaId ? faturas.find((item) => item.id === escolha.faturaId) ?? null : null;
  const [e2eDuplicado, hashUsado] = await Promise.all([
    extraido.e2e
      ? prisma.comprovantePagamento.findFirst({
          where: { empresaId: dados.empresaId, e2e: extraido.e2e },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.comprovantePagamento.findFirst({
      where: { empresaId: dados.empresaId, hashConteudo: hash },
      select: { id: true },
    }),
  ]);
  const alertas = alertasDoComprovante({
    extraido,
    empresa: { ...empresa, chavePix: pix?.chavePix ?? null },
    fatura: fatura
      ? { valor: fatura.valor.toFixed(2), criadoEm: fatura.criadoEm.toISOString() }
      : null,
    valorDiverge: escolha.valorDiverge,
    e2eDuplicado: Boolean(e2eDuplicado),
    hashUsado: Boolean(hashUsado),
  });
  const situacao = fatura ? "PENDENTE" : "SEM_FATURA";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.comprovantePagamento.create({
        data: {
          empresaId: dados.empresaId,
          clienteId: cliente?.id ?? null,
          faturaId: fatura?.id ?? null,
          messageSid: dados.messageSid,
          hashConteudo: hash,
          e2e: extraido.e2e,
          mime,
          conteudo: Buffer.from(dados.bytes),
          valorExtraido: extraido.valor,
          pagoEm: extraido.pagoEm ? new Date(`${extraido.pagoEm}T00:00:00.000Z`) : null,
          hora: extraido.hora,
          pagador: extraido.pagador,
          recebedorNome: extraido.recebedorNome,
          recebedorDocumento: extraido.recebedorDocumento,
          recebedorChave: extraido.recebedorChave,
          alertas,
          situacao,
        },
      });
      if (fatura) {
        await tx.fatura.updateMany({
          where: { id: fatura.id, empresaId: dados.empresaId, excluida: false },
          data: { comprovantePendente: true },
        });
      }
    });
  } catch (erro) {
    if (typeof erro === "object" && erro && "code" in erro && erro.code === "P2002") {
      return { gravado: false, situacao: null };
    }
    throw erro;
  }

  if (dados.twilio && dados.conta && dados.para && dentroDaJanelaComprovante(agora, agora)) {
    let callback = "";
    try {
      callback = urlWebhookTwilio();
    } catch {
      callback = "";
    }
    if (callback) {
      await dados.twilio.enviarTexto(dados.conta, {
        de: dados.para,
        para: dados.de,
        corpo: TEXTO_COMPROVANTE_RECEBIDO,
        statusCallback: callback,
      });
    }
  }
  return { gravado: true, situacao };
}

export async function confirmarComprovante(
  autor: AutorEmpresa & { usuarioId?: string },
  id: string,
  opcoes: { agora?: Date; asaas?: ClienteHttpAsaas; cora?: ClienteHttpCora } = {},
) {
  exigirCobranca(autor);
  const linha = await prisma.comprovantePagamento.findFirst({
    where: { id, empresaId: autor.empresaId },
    include: { fatura: true },
  });
  if (!linha || !linha.fatura || linha.situacao !== "PENDENTE") {
    throw new ErroAplicacao("Este comprovante não está aguardando conferência.", 409, "comprovante_fechado");
  }
  const agora = opcoes.agora ?? new Date();
  const pagoEm = linha.pagoEm ? isoDeData(linha.pagoEm) : dataHojeIso(agora);
  const valor = linha.valorExtraido ? linha.valorExtraido.toFixed(2) : linha.fatura.valor.toFixed(2);
  const valorOk = normalizarDinheiro(valor);
  if (!valorOk) throw new ErroAplicacao("O comprovante não tem um valor para a baixa.", 422, "valor_invalido");
  if (faturaAceitaBaixaManual(linha.fatura)) {
    await darBaixaManual(
      autor,
      linha.fatura.id,
      {
        pagoEm,
        valorRecebido: valorOk,
        forma: "PIX",
        nota: linha.e2e ? `Comprovante WhatsApp ${linha.e2e}` : "Comprovante recebido no WhatsApp",
        enviarConfirmacao: false,
      },
      opcoes,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.comprovantePagamento.updateMany({
      where: { id: linha.id, empresaId: autor.empresaId, situacao: "PENDENTE" },
      data: { situacao: "CONFIRMADO", usuarioId: autor.usuarioId ?? null },
    });
    if (linha.faturaId) {
      const outros = await tx.comprovantePagamento.count({
        where: { empresaId: autor.empresaId, faturaId: linha.faturaId, situacao: "PENDENTE", id: { not: linha.id } },
      });
      if (outros === 0) {
        await tx.fatura.updateMany({
          where: { id: linha.faturaId, empresaId: autor.empresaId },
          data: { comprovantePendente: false },
        });
      }
    }
  });
  return { ok: true as const };
}

export async function rejeitarComprovante(
  autor: AutorEmpresa & { usuarioId?: string },
  id: string,
  motivo: string,
) {
  exigirCobranca(autor);
  const texto = motivo.trim();
  if (!texto) throw new ErroAplicacao("Informe o motivo da rejeição.", 400, "motivo_obrigatorio");
  const linha = await prisma.comprovantePagamento.findFirst({
    where: { id, empresaId: autor.empresaId, situacao: { in: ["PENDENTE", "SEM_FATURA"] } },
  });
  if (!linha) throw new ErroAplicacao("Este comprovante não está aguardando conferência.", 409, "comprovante_fechado");
  await prisma.$transaction(async (tx) => {
    await tx.comprovantePagamento.updateMany({
      where: { id: linha.id, empresaId: autor.empresaId },
      data: { situacao: "REJEITADO", motivoRejeicao: texto.slice(0, 500), usuarioId: autor.usuarioId ?? null },
    });
    if (linha.faturaId) {
      const outros = await tx.comprovantePagamento.count({
        where: { empresaId: autor.empresaId, faturaId: linha.faturaId, situacao: "PENDENTE", id: { not: linha.id } },
      });
      if (outros === 0) {
        await tx.fatura.updateMany({
          where: { id: linha.faturaId, empresaId: autor.empresaId },
          data: { comprovantePendente: false },
        });
      }
    }
  });
  return { ok: true as const };
}
