import { formaCobrancaDe } from "@/lib/cobranca";
import { dataHojeIso, dataIsoValida, isoDeData } from "@/lib/data";
import type { ClienteServicoDTO } from "@/lib/tipos";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { avancarMes, chaveRecorrencia, deveEmitirRecorrencia } from "@/server/inter/calendario";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { logCora, logCoraErro } from "@/server/cora/log";
import { paraClienteServico } from "./mapeadores";
import { obterPreferenciasCobranca } from "./preferencia-cobranca-service";
import { cancelarFaturaCora, emitirFaturaCora } from "./cora-cobranca";
import { marcarFaturasAbertasExcluidas } from "./fatura-service";

const ATIVA = "ACTIVE";
const PAUSADA = "INACTIVE";
const CANCELADA = "CANCELADA";

function iso(data: Date | null): string | null {
  return data ? isoDeData(data) : null;
}

async function vinculoDaEmpresa(empresaId: string, id: string) {
  const vinculo = await prisma.clienteServico.findFirst({
    where: { id, empresaId },
    include: { servico: { select: { nome: true, aliquotaImposto: true } }, cliente: true },
  });
  if (!vinculo) throw new ErroAplicacao("Serviço do cliente não encontrado.", 404, "nao_encontrado");
  return vinculo;
}

function exigirMensal(vinculo: { recorrencia: string; status: string }) {
  if (vinculo.recorrencia !== "MENSAL" || vinculo.status !== "ATIVO") {
    throw new ErroAplicacao("Só uma venda mensal ativa entra na cobrança recorrente.", 409, "recorrencia_indisponivel");
  }
}

export async function ativarRecorrenciaCora(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: {
    diaVencimento: number;
    proximoVencimento: string;
    valor: string;
    formaCobranca: string;
    descricao: string;
  },
  clienteHttp?: ClienteHttpCora,
): Promise<ClienteServicoDTO> {
  const vinculo = await vinculoDaEmpresa(autor.empresaId, clienteServicoId);
  exigirMensal(vinculo);
  if (vinculo.asaasSubscriptionId) {
    throw new ErroAplicacao("Esta venda já tem cobrança recorrente no Asaas.", 409, "assinatura_existente");
  }
  if (vinculo.asaasAssinaturaStatus === ATIVA || vinculo.asaasAssinaturaStatus === PAUSADA) {
    throw new ErroAplicacao("Esta venda já tem cobrança recorrente.", 409, "assinatura_existente");
  }
  const forma = formaCobrancaDe(entrada.formaCobranca);
  if (forma === "CREDIT_CARD") {
    throw new ErroAplicacao("A Cora, nesta cobrança, não recebe cartão. Use boleto com Pix.", 422, "forma_indisponivel");
  }
  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: {
      valor: entrada.valor,
      asaasAssinaturaStatus: ATIVA,
      formaCobrancaRecorrente: "BOLETO",
      diaVencimento: entrada.diaVencimento,
      proximoVencimento: new Date(`${entrada.proximoVencimento}T00:00:00.000Z`),
      descricaoRecorrente: entrada.descricao,
    },
  });
  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  if (deveEmitirRecorrencia(entrada.proximoVencimento, dataHojeIso(), prefs.diasAntesGerar ?? 0)) {
    await emitirFaturaCora(
      autor,
      vinculo.clienteId,
      {
        valor: entrada.valor,
        vencimento: entrada.proximoVencimento,
        formaCobranca: "BOLETO",
        descricao: entrada.descricao,
        clienteServicoId: vinculo.id,
        chaveIdempotencia: chaveRecorrencia(vinculo.id, entrada.proximoVencimento),
      },
      clienteHttp,
    );
  }
  return paraClienteServico(await vinculoDaEmpresa(autor.empresaId, vinculo.id), true, true);
}

export async function editarRecorrenciaCora(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: {
    diaVencimento: number;
    proximoVencimento: string;
    valor: string;
    formaCobranca: string;
    descricao: string;
  },
): Promise<ClienteServicoDTO> {
  const vinculo = await vinculoDaEmpresa(autor.empresaId, clienteServicoId);
  if (vinculo.asaasSubscriptionId || (vinculo.asaasAssinaturaStatus !== ATIVA && vinculo.asaasAssinaturaStatus !== PAUSADA)) {
    throw new ErroAplicacao("Esta venda não tem cobrança recorrente para editar.", 409, "assinatura_ausente");
  }
  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: {
      valor: entrada.valor,
      formaCobrancaRecorrente: "BOLETO",
      diaVencimento: entrada.diaVencimento,
      proximoVencimento: new Date(`${entrada.proximoVencimento}T00:00:00.000Z`),
      descricaoRecorrente: entrada.descricao,
    },
  });
  return paraClienteServico(await vinculoDaEmpresa(autor.empresaId, vinculo.id), true, true);
}

export async function pausarRecorrenciaCora(autor: AutorEmpresa, clienteServicoId: string): Promise<ClienteServicoDTO> {
  const vinculo = await vinculoDaEmpresa(autor.empresaId, clienteServicoId);
  if (vinculo.asaasSubscriptionId || vinculo.asaasAssinaturaStatus !== ATIVA) {
    throw new ErroAplicacao("Só uma recorrência ativa pode ser pausada.", 409, "assinatura_ausente");
  }
  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: { asaasAssinaturaStatus: PAUSADA },
  });
  return paraClienteServico(await vinculoDaEmpresa(autor.empresaId, vinculo.id), true, true);
}

export async function retomarRecorrenciaCora(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: { diaVencimento: number; proximoVencimento: string },
): Promise<ClienteServicoDTO> {
  const vinculo = await vinculoDaEmpresa(autor.empresaId, clienteServicoId);
  if (vinculo.asaasSubscriptionId || vinculo.asaasAssinaturaStatus !== PAUSADA) {
    throw new ErroAplicacao("Só uma recorrência pausada pode ser retomada.", 409, "assinatura_ausente");
  }
  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: {
      asaasAssinaturaStatus: ATIVA,
      diaVencimento: entrada.diaVencimento,
      proximoVencimento: new Date(`${entrada.proximoVencimento}T00:00:00.000Z`),
    },
  });
  return paraClienteServico(await vinculoDaEmpresa(autor.empresaId, vinculo.id), true, true);
}

export async function cancelarRecorrenciaCora(
  autor: AutorEmpresa,
  clienteServicoId: string,
  clienteHttp?: ClienteHttpCora,
): Promise<ClienteServicoDTO> {
  const vinculo = await vinculoDaEmpresa(autor.empresaId, clienteServicoId);
  if (vinculo.asaasSubscriptionId || !vinculo.asaasAssinaturaStatus || vinculo.asaasAssinaturaStatus === CANCELADA) {
    throw new ErroAplicacao("Esta venda não tem cobrança recorrente para cancelar.", 409, "assinatura_ausente");
  }
  const abertas = await prisma.fatura.findMany({
    where: {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      provedor: "CORA",
      excluida: false,
      idExterno: { not: null },
      statusNormalizado: { in: ["PENDENTE", "VENCIDO", "CRIANDO"] },
    },
    select: { id: true },
  });
  for (const fatura of abertas) {
    await cancelarFaturaCora(autor, fatura.id, clienteHttp);
  }
  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: { asaasAssinaturaStatus: CANCELADA },
  });
  await marcarFaturasAbertasExcluidas(autor.empresaId, vinculo.id);
  return paraClienteServico(await vinculoDaEmpresa(autor.empresaId, vinculo.id), true, true);
}

export async function executarRecorrenciasCora(opcoes: { agora?: Date; empresaId?: string; clienteHttp?: ClienteHttpCora } = {}) {
  const hoje = dataHojeIso(opcoes.agora ?? new Date());
  const empresas = await prisma.empresa.findMany({
    where: { provedorPagamento: "CORA", status: "ATIVA", ...(opcoes.empresaId ? { id: opcoes.empresaId } : {}) },
    select: { id: true },
  });
  let emitidas = 0;
  let falhas = 0;
  for (const empresa of empresas) {
    const prefs = await obterPreferenciasCobranca(empresa.id);
    const antecedencia = prefs.diasAntesGerar ?? 0;
    const vinculos = await prisma.clienteServico.findMany({
      where: {
        empresaId: empresa.id,
        recorrencia: "MENSAL",
        status: "ATIVO",
        asaasSubscriptionId: null,
        asaasAssinaturaStatus: ATIVA,
        proximoVencimento: { not: null },
      },
    });
    const autor: AutorEmpresa = { empresaId: empresa.id, papel: "DONO" };
    for (const vinculo of vinculos) {
      const vencimento = iso(vinculo.proximoVencimento);
      const dia = vinculo.diaVencimento;
      if (!vencimento || !dia || !dataIsoValida(vencimento) || !deveEmitirRecorrencia(vencimento, hoje, antecedencia)) {
        continue;
      }
      try {
        await emitirFaturaCora(
          autor,
          vinculo.clienteId,
          {
            valor: vinculo.valor.toFixed(2),
            vencimento,
            formaCobranca: "BOLETO",
            descricao: vinculo.descricaoRecorrente ?? undefined,
            clienteServicoId: vinculo.id,
            chaveIdempotencia: chaveRecorrencia(vinculo.id, vencimento),
          },
          opcoes.clienteHttp,
        );
        await prisma.clienteServico.updateMany({
          where: { id: vinculo.id, empresaId: empresa.id, proximoVencimento: vinculo.proximoVencimento },
          data: { proximoVencimento: new Date(`${avancarMes(vencimento, dia)}T00:00:00.000Z`) },
        });
        emitidas += 1;
      } catch (erro) {
        falhas += 1;
        logCoraErro("falha na recorrência", {
          empresaId: empresa.id,
          clienteServicoId: vinculo.id,
          codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
        });
      }
    }
  }
  logCora("recorrência executada", { empresas: empresas.length, emitidas, falhas });
  return { empresas: empresas.length, emitidas, falhas };
}

export async function empresaUsaCora(empresaId: string): Promise<boolean> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { provedorPagamento: true } });
  return empresa?.provedorPagamento === "CORA";
}
