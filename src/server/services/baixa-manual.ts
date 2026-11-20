import { AVISO_BAIXA_CORA, AVISO_BAIXA_LOCAL, faturaAceitaBaixaManual } from "@/lib/baixa-manual";
import { dataHojeIso } from "@/lib/data";
import type { FaturaDTO } from "@/lib/tipos";
import { esquemaBaixaManual } from "@/lib/validacao";
import { provedorCodigo, STATUS_NORMALIZADO, type ProvedorCodigo } from "@/lib/status-pagamento";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { abrirClienteAsaas, traduzirErroAsaas } from "@/server/asaas/abrir";
import { type ClienteHttpAsaas, ErroAsaas } from "@/server/asaas/contrato";
import { abrirClienteCora } from "@/server/cora/abrir";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { criarAdaptadorCora } from "@/server/pagamentos/adaptador-cora";
import { lerEsquema } from "@/server/validar";
import { enfileirarPagoWhatsapp } from "./whatsapp-fila";

const TRAVA_MS = 2 * 60 * 1000;

export type EfeitoBanco = "ASAAS_RECEBIDO_EM_DINHEIRO" | "CORA_CANCELADO" | "SOMENTE_LOCAL";

export type ResultadoBaixaManual = {
  fatura: FaturaDTO;
  aviso: string | null;
};

type OpcoesBaixa = {
  agora?: Date;
  asaas?: ClienteHttpAsaas;
  cora?: ClienteHttpCora;
};

function statusLocal(provedor: ProvedorCodigo): string {
  if (provedor === "ASAAS") return "RECEIVED_IN_CASH";
  if (provedor === "CORA") return "PAID";
  if (provedor === "INTER") return "MARCADO_RECEBIDO";
  if (provedor === "PIX_DIRETO") return "PAGA";
  return "PAGO";
}

function avisoDo(provedor: ProvedorCodigo, efeito: EfeitoBanco): string | null {
  if (efeito === "CORA_CANCELADO") return AVISO_BAIXA_CORA;
  if (efeito === "SOMENTE_LOCAL" && provedor !== "PIX_DIRETO") return AVISO_BAIXA_LOCAL;
  return null;
}

function aberta(status: string, provedor: ProvedorCodigo): boolean {
  return faturaAceitaBaixaManual({ status, excluida: false, provedor });
}

async function faturaPronta(autor: AutorEmpresa, id: string): Promise<FaturaDTO> {
  const { obterFatura } = await import("./fatura-service");
  return obterFatura(autor, id);
}

async function reservarBaixa(empresaId: string, faturaId: string, agora: Date) {
  const recente = new Date(agora.getTime() - TRAVA_MS);
  const marcado = await prisma.fatura.updateMany({
    where: {
      id: faturaId,
      empresaId,
      excluida: false,
      AND: [
        {
          OR: [
            { statusNormalizado: { in: [STATUS_NORMALIZADO.PENDENTE, STATUS_NORMALIZADO.VENCIDO] } },
            { statusNormalizado: null },
          ],
        },
        { OR: [{ baixaManualEm: null }, { baixaManualEm: { lt: recente } }] },
      ],
    },
    data: { baixaManualEm: agora },
  });
  if (marcado.count === 1) return;
  throw new ErroAplicacao(
    "Já existe uma baixa manual em andamento nesta fatura. Espere um instante e tente de novo.",
    409,
    "baixa_em_andamento",
  );
}

async function soltarBaixa(empresaId: string, faturaId: string) {
  await prisma.fatura.updateMany({
    where: {
      id: faturaId,
      empresaId,
      baixaManualEm: { not: null },
      OR: [
        { statusNormalizado: { in: [STATUS_NORMALIZADO.PENDENTE, STATUS_NORMALIZADO.VENCIDO] } },
        { statusNormalizado: null },
      ],
    },
    data: { baixaManualEm: null },
  });
}

async function receberNoAsaas(
  empresaId: string,
  idExterno: string,
  dados: { pagoEm: string; valorRecebido: string },
  httpInjetado?: ClienteHttpAsaas,
): Promise<EfeitoBanco> {
  const { http } = await abrirClienteAsaas(empresaId, httpInjetado);
  try {
    await http.receberEmDinheiro(idExterno, { pagamentoEm: dados.pagoEm, valor: dados.valorRecebido });
    return "ASAAS_RECEBIDO_EM_DINHEIRO";
  } catch (erro) {
    if (erro instanceof ErroAsaas && (erro.status === 400 || erro.status === 409)) {
      const atual = await http.obterCobranca(idExterno);
      if (atual.status === "RECEIVED_IN_CASH") return "ASAAS_RECEBIDO_EM_DINHEIRO";
    }
    throw erro;
  }
}

async function cancelarNaCora(empresaId: string, idExterno: string, httpInjetado?: ClienteHttpCora): Promise<EfeitoBanco> {
  const http = await abrirClienteCora(empresaId, httpInjetado);
  const provedor = criarAdaptadorCora(http);
  try {
    await provedor.cancelarCobranca(idExterno);
  } catch (erro) {
    if (!(erro instanceof ErroAplicacao && erro.status === 404)) throw erro;
  }
  return "CORA_CANCELADO";
}

async function efeitoNoBanco(
  empresaId: string,
  fatura: { provedor: string; asaasPaymentId: string | null; idExterno: string | null },
  dados: { pagoEm: string; valorRecebido: string },
  opcoes: OpcoesBaixa,
): Promise<EfeitoBanco> {
  const provedor = provedorCodigo(fatura.provedor);
  if (provedor === "ASAAS") {
    const idExterno = fatura.asaasPaymentId || fatura.idExterno;
    if (!idExterno) return "SOMENTE_LOCAL";
    return receberNoAsaas(empresaId, idExterno, dados, opcoes.asaas);
  }
  if (provedor === "CORA") {
    if (!fatura.idExterno) return "SOMENTE_LOCAL";
    return cancelarNaCora(empresaId, fatura.idExterno, opcoes.cora);
  }
  return "SOMENTE_LOCAL";
}

export async function darBaixaManual(
  autor: AutorEmpresa & { usuarioId?: string },
  faturaId: string,
  entrada: unknown,
  opcoes: OpcoesBaixa = {},
): Promise<ResultadoBaixaManual> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaBaixaManual, entrada);
  const agora = opcoes.agora ?? new Date();
  const hoje = dataHojeIso(agora);
  if (dados.pagoEm > hoje) {
    throw new ErroAplicacao("A data do pagamento não pode ser futura.", 400, "data_futura");
  }

  const atual = await prisma.fatura.findFirst({ where: { id: faturaId, empresaId: autor.empresaId } });
  if (!atual || atual.excluida || !aberta(atual.status, provedorCodigo(atual.provedor))) {
    throw new ErroAplicacao("Só dá para dar baixa em uma fatura em aberto ou vencida.", 409, "fatura_fechada");
  }

  const provedor = provedorCodigo(atual.provedor);
  const idAsaas = atual.asaasPaymentId || atual.idExterno;
  const chamaBanco = (provedor === "ASAAS" && Boolean(idAsaas)) || (provedor === "CORA" && Boolean(atual.idExterno));
  if (chamaBanco) await reservarBaixa(autor.empresaId, atual.id, agora);

  let efeito: EfeitoBanco;
  try {
    efeito = await efeitoNoBanco(
      autor.empresaId,
      atual,
      { pagoEm: dados.pagoEm, valorRecebido: dados.valorRecebido },
      opcoes,
    );
  } catch (erro) {
    if (chamaBanco) await soltarBaixa(autor.empresaId, atual.id);
    if (provedor === "ASAAS") traduzirErroAsaas(erro);
    throw erro;
  }

  const aviso = avisoDo(provedor, efeito);
  const pagoEm = new Date(`${dados.pagoEm}T00:00:00.000Z`);
  const nota = dados.nota?.trim() ? dados.nota.trim() : null;
  const baixou = await prisma.$transaction(async (tx) => {
    const marcado = await tx.fatura.updateMany({
      where: {
        id: atual.id,
        empresaId: autor.empresaId,
        excluida: false,
        OR: [
          { statusNormalizado: { in: [STATUS_NORMALIZADO.PENDENTE, STATUS_NORMALIZADO.VENCIDO] } },
          { statusNormalizado: null, NOT: { status: { in: ["CANCELADA", "CANCELLED", "CANCELED", "CANCELADO"] } } },
          ...(chamaBanco ? [{ baixaManualEm: { not: null }, statusNormalizado: STATUS_NORMALIZADO.PAGO }] : []),
        ],
      },
      data: {
        status: statusLocal(provedor),
        statusNormalizado: STATUS_NORMALIZADO.PAGO,
        pagoEm,
        baixaManualEm: agora,
      },
    });
    if (marcado.count !== 1) return false;
    const ja = await tx.conciliacaoPagamento.findFirst({
      where: { empresaId: autor.empresaId, faturaId: atual.id, origem: "MANUAL" },
      select: { id: true },
    });
    if (!ja) {
      await tx.conciliacaoPagamento.create({
        data: {
          empresaId: autor.empresaId,
          faturaId: atual.id,
          origem: "MANUAL",
          pagoEm,
          nota,
          usuarioId: autor.usuarioId ?? null,
          formaRecebimento: dados.forma,
          valorRecebido: dados.valorRecebido,
          efeitoBanco: efeito,
          avisoBanco: aviso,
        },
      });
    }
    return true;
  });

  if (!baixou) {
    throw new ErroAplicacao("Só dá para dar baixa em uma fatura em aberto ou vencida.", 409, "fatura_fechada");
  }

  if (dados.enviarConfirmacao) {
    const fatura = await prisma.fatura.findFirst({
      where: { id: atual.id, empresaId: autor.empresaId },
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
    if (fatura && fatura.statusNormalizado === "PAGO") {
      const regua = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
      await enfileirarPagoWhatsapp(prisma, fatura, regua?.modoTeste ?? true, agora);
    }
  }

  return { fatura: await faturaPronta(autor, atual.id), aviso };
}
