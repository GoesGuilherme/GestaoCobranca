import { isoDeData } from "@/lib/data";
import { somenteDocumento } from "@/lib/documento";
import type { FaturaDTO, SituacaoFatura } from "@/lib/tipos";
import { esquemaFatura } from "@/lib/validacao";
import { abrirClienteAsaas, traduzirErroAsaas } from "@/server/asaas/abrir";
import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import { ErroAsaas } from "@/server/asaas/contrato";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca, exigirVerFaturas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

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
  cliente: { nomeFantasia: string };
  clienteServico: { servico: { nome: string } } | null;
};

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
  };
}

const includeNomes = {
  cliente: { select: { nomeFantasia: true } },
  clienteServico: { select: { servico: { select: { nome: true } } } },
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

async function garantirClienteAsaas(
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
  if (cliente.asaasCustomerId) return cliente.asaasCustomerId;
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
  const gravado = await prisma.cliente.updateMany({
    where: { id: cliente.id, empresaId, asaasCustomerId: null },
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

  const forma = dados.formaCobranca ?? "BOLETO";
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
      return paraFatura(fatura);
    } catch (erro) {
      await http.cancelarCobranca(cobranca.id).catch(() => undefined);
      throw erro;
    }
  } catch (erro) {
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
      if (!(erro instanceof ErroAsaas) || erro.status !== 404) throw erro;
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
