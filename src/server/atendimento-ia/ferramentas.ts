import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { absolutizarLinkCobranca } from "@/lib/pix-link";
import { PAUSA_ATENDIMENTO_IA_MS } from "@/lib/atendimento-ia";
import { provedorCodigo, statusNormalizado } from "@/lib/status-pagamento";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { registrarPromessaPeloWhatsapp } from "@/server/services/promessa-service";

export type ResultadoFerramenta = {
  texto: string;
  faturaId?: string;
  ids?: string[];
};

type FaturaLinha = {
  id: string;
  valor: { toFixed(casas: number): string };
  vencimento: Date;
  status: string;
  excluida: boolean;
  provedor: string;
  boletoUrl: string | null;
  faturaUrl: string | null;
  pixCopiaCola: string | null;
  linhaDigitavel: string | null;
};

type Situacao = "em aberto" | "vencida" | "paga" | "outra";

function situacaoDe(fatura: { status: string; excluida: boolean; provedor: string }): Situacao {
  if (fatura.excluida) return "outra";
  const normalizado = statusNormalizado(fatura.status, provedorCodigo(fatura.provedor));
  if (normalizado === "PAGO") return "paga";
  if (normalizado === "VENCIDO") return "vencida";
  if (normalizado === "PENDENTE") return "em aberto";
  return "outra";
}

function aberta(situacao: Situacao) {
  return situacao === "em aberto" || situacao === "vencida";
}

function vista(fatura: FaturaLinha) {
  const situacao = situacaoDe(fatura);
  const valor = formatarReais(fatura.valor.toFixed(2));
  const vencimento = formatarDataIso(isoDeData(fatura.vencimento));
  return { situacao, valor, vencimento };
}

function linkDe(fatura: FaturaLinha): string | null {
  const bruto = (fatura.faturaUrl ?? fatura.boletoUrl ?? "").trim();
  if (!bruto) return null;
  return absolutizarLinkCobranca(bruto);
}

// Cada leitura filtra empresaId e clienteId juntos.
// Não chama a rede e não abre transação: o pool na Vercel é 1.
export function criarFerramentasAtendimento(dados: {
  empresaId: string;
  clienteId: string;
  conversaId: string;
  nomeEmpresa: string;
  textoRepasse: string;
  agora: Date;
}) {
  async function faturasDoCliente(): Promise<FaturaLinha[]> {
    return prisma.fatura.findMany({
      where: { empresaId: dados.empresaId, clienteId: dados.clienteId, excluida: false },
      orderBy: { vencimento: "asc" },
      take: 20,
      select: {
        id: true,
        valor: true,
        vencimento: true,
        status: true,
        excluida: true,
        provedor: true,
        boletoUrl: true,
        faturaUrl: true,
        pixCopiaCola: true,
        linhaDigitavel: true,
      },
    });
  }

  async function porId(faturaId: string): Promise<FaturaLinha | null> {
    return prisma.fatura.findFirst({
      where: {
        id: faturaId,
        empresaId: dados.empresaId,
        clienteId: dados.clienteId,
        excluida: false,
      },
      select: {
        id: true,
        valor: true,
        vencimento: true,
        status: true,
        excluida: true,
        provedor: true,
        boletoUrl: true,
        faturaUrl: true,
        pixCopiaCola: true,
        linhaDigitavel: true,
      },
    });
  }

  async function listarFaturas(): Promise<ResultadoFerramenta> {
    const abertas = (await faturasDoCliente()).filter((fatura) => aberta(situacaoDe(fatura))).slice(0, 8);
    if (abertas.length === 0) {
      return { texto: `Não há fatura em aberto nem vencida no cadastro da ${dados.nomeEmpresa}.` };
    }
    const linhas = abertas.map((fatura) => {
      const item = vista(fatura);
      return `${item.situacao}: ${item.valor}, vencimento ${item.vencimento}`;
    });
    return {
      texto: `Faturas em aberto ou vencidas na ${dados.nomeEmpresa}:\n${linhas.join("\n")}`,
      faturaId: abertas[0]?.id,
      ids: abertas.map((fatura) => fatura.id),
    };
  }

  async function segundaVia(faturaId: string | null): Promise<ResultadoFerramenta> {
    const escolhida = faturaId
      ? await porId(faturaId)
      : (await faturasDoCliente()).find((fatura) => aberta(situacaoDe(fatura))) ?? null;
    if (!escolhida) {
      return { texto: `Não encontrei essa cobrança na ${dados.nomeEmpresa}. Não gerei cobrança nova.` };
    }
    const item = vista(escolhida);
    if (!aberta(item.situacao)) {
      return {
        faturaId: escolhida.id,
        ids: [escolhida.id],
        texto: `A cobrança de ${item.valor}, com vencimento em ${item.vencimento}, está ${item.situacao}. Não reenviei link nem Pix.`,
      };
    }
    const link = linkDe(escolhida);
    const pix = escolhida.pixCopiaCola?.trim() || null;
    const linha = escolhida.linhaDigitavel?.replace(/\s+/g, "").trim() || null;
    if (!link && !pix && !linha) {
      return {
        faturaId: escolhida.id,
        ids: [escolhida.id],
        texto: `A cobrança de ${item.valor}, vencimento ${item.vencimento}, situação ${item.situacao}, não tem link nem Pix copia e cola gravados. Não gerei cobrança nova.`,
      };
    }
    const partes = [
      `Segunda via da cobrança de ${item.valor}, vencimento ${item.vencimento}, situação ${item.situacao}.`,
    ];
    if (link) partes.push(`Link para pagamento: ${link}`);
    if (pix) partes.push(`Pix copia e cola: ${pix}`);
    if (linha) partes.push(`Linha digitável: ${linha}`);
    return { faturaId: escolhida.id, ids: [escolhida.id], texto: partes.join("\n") };
  }

  async function registrarPromessa(faturaId: string, dataPrometida: string): Promise<ResultadoFerramenta> {
    const escolhida = await porId(faturaId);
    if (!escolhida) {
      return { texto: `Não encontrei essa cobrança na ${dados.nomeEmpresa}. Nada foi registrado.` };
    }
    if (!aberta(situacaoDe(escolhida))) {
      return { texto: "Só dá para prometer em fatura em aberto ou vencida. Nada foi registrado." };
    }
    try {
      const criada = await registrarPromessaPeloWhatsapp({
        empresaId: dados.empresaId,
        faturaId: escolhida.id,
        clienteId: dados.clienteId,
        dataPrometida,
        valorPrometido: escolhida.valor.toFixed(2),
        agora: dados.agora,
      });
      return {
        faturaId: escolhida.id,
        ids: [escolhida.id],
        texto: `Anotado: pagamento de ${formatarReais(criada.valorPrometido)} até ${formatarDataIso(criada.dataPrometida)}. A régua de cobrança desta fatura fica pausada até essa data.`,
      };
    } catch (erro) {
      if (erro instanceof ErroAplicacao) {
        return { faturaId: escolhida.id, ids: [escolhida.id], texto: `${erro.message} Nada foi registrado além do que já existia.` };
      }
      throw erro;
    }
  }

  async function transferir(motivo: "PEDIDO" | "FORA" | "DESCONTO"): Promise<ResultadoFerramenta> {
    const rotulo = motivo === "DESCONTO" ? "Pedido de desconto" : motivo === "PEDIDO" ? "Pediu uma pessoa" : "Fora do atendimento";
    await prisma.conversaAtendimentoIa.updateMany({
      where: { id: dados.conversaId, empresaId: dados.empresaId },
      data: {
        precisaAtencao: true,
        pausadaAte: new Date(dados.agora.getTime() + PAUSA_ATENDIMENTO_IA_MS),
        motivoAtencao: rotulo,
      },
    });
    const contato = dados.textoRepasse.replace(/\s+/g, " ").trim();
    const base = `Vou chamar uma pessoa da ${dados.nomeEmpresa} para continuar este atendimento.`;
    return { texto: contato ? `${base} ${contato}` : base };
  }

  return { listarFaturas, segundaVia, registrarPromessa, transferir };
}

export type FerramentasAtendimento = ReturnType<typeof criarFerramentasAtendimento>;
