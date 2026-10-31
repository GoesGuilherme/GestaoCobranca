import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { STATUS_ABERTAS, STATUS_PAGAS, STATUS_VENCIDAS, faturaNaSituacao } from "@/lib/fatura-situacao";
import { formatarDataIso } from "@/lib/formatacao";
import { textoHumano, textoTecnico } from "@/lib/assessor-mensagens";
import { prisma } from "@/server/db";

export type ResultadoFerramenta = {
  texto: string;
  faturaId?: string;
};

type FaturaLinha = {
  id: string;
  valor: { toFixed(casas: number): string };
  vencimento: Date;
  status: string;
  descricao: string | null;
  boletoUrl: string | null;
  faturaUrl: string | null;
  excluida: boolean;
};

function rotuloSituacao(status: string, excluida: boolean) {
  if (faturaNaSituacao({ status, excluida }, "pagas")) return "paga";
  if (faturaNaSituacao({ status, excluida }, "vencidas")) return "vencida";
  if (faturaNaSituacao({ status, excluida }, "em_aberto")) return "em aberto";
  return "outra";
}

function linhaTexto(fatura: FaturaLinha) {
  const valor = formatarReais(fatura.valor.toFixed(2));
  const vencimento = formatarDataIso(isoDeData(fatura.vencimento));
  const descricao = fatura.descricao?.replace(/\s+/g, " ").trim().slice(0, 80);
  const situacao = rotuloSituacao(fatura.status, fatura.excluida);
  const complemento = descricao ? ` (${descricao})` : "";
  return { valor, vencimento, situacao, complemento, texto: `${situacao}: ${valor}, vencimento ${vencimento}${complemento}` };
}

async function faturaDoCliente(empresaId: string, clienteId: string, faturaId: string | null) {
  if (faturaId) {
    return prisma.fatura.findFirst({
      where: { id: faturaId, empresaId, clienteId, excluida: false },
    });
  }
  return null;
}

export function criarFerramentasAssessor(dados: {
  empresaId: string;
  clienteId: string;
  nomeEmpresa: string;
  conversaId: string;
}) {
  async function listarFaturas(): Promise<ResultadoFerramenta> {
    const faturas = await prisma.fatura.findMany({
      where: {
        empresaId: dados.empresaId,
        clienteId: dados.clienteId,
        excluida: false,
        status: { in: [...STATUS_ABERTAS, ...STATUS_VENCIDAS] },
      },
      orderBy: { vencimento: "asc" },
      take: 8,
    });
    if (faturas.length === 0) {
      return { texto: `Não há fatura em aberto nem vencida no cadastro da ${dados.nomeEmpresa}.` };
    }
    const linhas = faturas.map((fatura) => linhaTexto(fatura).texto);
    return {
      texto: `Faturas em aberto ou vencidas na ${dados.nomeEmpresa}:\n${linhas.join("\n")}`,
      faturaId: faturas[0]?.id,
    };
  }

  async function linkBoleto(faturaId: string | null): Promise<ResultadoFerramenta> {
    const escolhida = faturaId
      ? await faturaDoCliente(dados.empresaId, dados.clienteId, faturaId)
      : await prisma.fatura.findFirst({
          where: {
            empresaId: dados.empresaId,
            clienteId: dados.clienteId,
            excluida: false,
            status: { in: [...STATUS_ABERTAS, ...STATUS_VENCIDAS] },
          },
          orderBy: { vencimento: "asc" },
        });
    if (!escolhida) {
      return { texto: `Não encontrei essa cobrança na ${dados.nomeEmpresa}. Não criei cobrança nova.` };
    }
    const vista = linhaTexto(escolhida);
    const link = escolhida.boletoUrl ?? escolhida.faturaUrl;
    if (!link) {
      return {
        faturaId: escolhida.id,
        texto: `A cobrança de ${vista.valor}, com vencimento em ${vista.vencimento}, não tem link do Asaas gravado. Não criei cobrança nova.`,
      };
    }
    return {
      faturaId: escolhida.id,
      texto: `Link do Asaas da cobrança de ${vista.valor}, vencimento ${vista.vencimento}: ${link}`,
    };
  }

  async function consultarPagamento(faturaId: string | null): Promise<ResultadoFerramenta> {
    const escolhida = faturaId
      ? await faturaDoCliente(dados.empresaId, dados.clienteId, faturaId)
      : await prisma.fatura.findFirst({
          where: { empresaId: dados.empresaId, clienteId: dados.clienteId, excluida: false },
          orderBy: { atualizadoEm: "desc" },
        });
    if (!escolhida) {
      return { texto: `Não encontrei cobrança deste cliente na ${dados.nomeEmpresa}.` };
    }
    const vista = linhaTexto(escolhida);
    const paga = (STATUS_PAGAS as readonly string[]).includes(escolhida.status);
    return {
      faturaId: escolhida.id,
      texto: paga
        ? `A cobrança de ${vista.valor}, com vencimento em ${vista.vencimento}, está paga.`
        : `A cobrança de ${vista.valor}, com vencimento em ${vista.vencimento}, ainda não está paga. A situação é ${vista.situacao}.`,
    };
  }

  async function pedirHumano(motivo: "TECNICO" | "PEDIDO" | "FORA_ESCOPO", resumo: string): Promise<ResultadoFerramenta> {
    const textoResumo = resumo.replace(/\s+/g, " ").trim().slice(0, 500) || "Pedido de atendimento humano.";
    await prisma.pedidoAtendimento.create({
      data: {
        empresaId: dados.empresaId,
        conversaId: dados.conversaId,
        clienteId: dados.clienteId,
        motivo,
        resumo: textoResumo,
        status: "ABERTO",
      },
    });
    await prisma.conversaAssessor.updateMany({
      where: { id: dados.conversaId, empresaId: dados.empresaId },
      data: { iaPausada: true },
    });
    const texto = motivo === "TECNICO" ? textoTecnico(dados.nomeEmpresa) : textoHumano(dados.nomeEmpresa);
    return { texto };
  }

  return { listarFaturas, linkBoleto, consultarPagamento, pedirHumano };
}

export type FerramentasAssessor = ReturnType<typeof criarFerramentasAssessor>;
