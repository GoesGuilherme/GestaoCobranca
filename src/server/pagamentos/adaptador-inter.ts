import { statusNormalizado } from "@/lib/status-pagamento";
import type { CobrancaInter, ClienteHttpInter } from "@/server/inter/contrato";
import { seuNumeroDe } from "@/server/inter/seu-numero";
import { CAPACIDADES_INTER } from "./capacidades";
import { normalizarWebhookInter } from "./webhook-inter";
import type {
  CobrancaNormalizada,
  EntradaWebhook,
  EventoNormalizado,
  MeioPagamento,
  NovaCobranca,
  PaginaCobrancas,
  ProvedorPagamento,
} from "./tipos";
import { ErroAplicacao } from "@/server/erros";

function meioDe(origem: CobrancaInter["origemRecebimento"]): MeioPagamento | null {
  if (origem === "PIX") return "PIX";
  if (origem === "BOLETO") return "BOLETO";
  return null;
}

function pagoEmDe(cobranca: CobrancaInter): string | null {
  const status = statusNormalizado(cobranca.situacao, "INTER");
  if (status !== "PAGO") return null;
  const data = cobranca.dataSituacao?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

export function deCobrancaInter(cobranca: CobrancaInter): CobrancaNormalizada {
  const status = statusNormalizado(cobranca.situacao, "INTER");
  return {
    idExterno: cobranca.codigoSolicitacao,
    idClienteExterno: null,
    idAssinaturaExterna: null,
    valor: cobranca.valorNominal,
    vencimento: cobranca.dataVencimento,
    statusBruto: cobranca.situacao,
    status,
    formaCobranca: "BOLETO",
    meio: meioDe(cobranca.origemRecebimento),
    boletoUrl: null,
    faturaUrl: null,
    linhaDigitavel: cobranca.linhaDigitavel,
    codigoBarras: cobranca.codigoBarras,
    pixCopiaCola: cobranca.pixCopiaCola,
    descricao: cobranca.descricao,
    excluida: status === "CANCELADO",
    pagoEm: pagoEmDe(cobranca),
  };
}

export class AdaptadorInter implements ProvedorPagamento {
  readonly provedor = "INTER" as const;

  constructor(readonly inter: ClienteHttpInter) {}

  capacidades() {
    return CAPACIDADES_INTER;
  }

  async testarConexao() {
    return this.inter.testarConexao();
  }

  async criarCobranca(dados: NovaCobranca) {
    if (dados.formaCobranca === "CARTAO") {
      throw new ErroAplicacao("O Inter, nesta cobrança, não recebe cartão. Use boleto com Pix.", 422, "forma_indisponivel");
    }
    if (!dados.pagador) {
      throw new ErroAplicacao("O Inter precisa do nome, documento e endereço do pagador.", 422, "pagador_incompleto");
    }
    const seuNumero = seuNumeroDe(dados.chaveIdempotencia);
    const criada = await this.inter.criarCobranca({
      seuNumero,
      valorNominal: dados.valor,
      dataVencimento: dados.vencimento,
      pagador: dados.pagador,
      descricao: dados.descricao,
      encargos: dados.encargos,
    });
    return deCobrancaInter(criada);
  }

  async consultarCobranca(idExterno: string) {
    return deCobrancaInter(await this.inter.consultarCobranca(idExterno));
  }

  async cancelarCobranca(idExterno: string, motivo?: string) {
    await this.inter.cancelarCobranca(idExterno, motivo?.trim() || "Cancelada no Taguaro");
  }

  async editarCobranca(idExterno: string, dados: { valor?: string; vencimento?: string }) {
    await this.inter.editarCobranca(idExterno, dados);
  }

  async listarCobrancas(filtro: {
    statusBruto?: string;
    offset: number;
    limit: number;
    dataInicial?: string;
    dataFinal?: string;
  }): Promise<PaginaCobrancas> {
    const hoje = new Date().toISOString().slice(0, 10);
    const itens = Math.min(Math.max(filtro.limit, 1), 100);
    const pagina = await this.inter.listarCobrancas({
      dataInicial: filtro.dataInicial ?? hoje,
      dataFinal: filtro.dataFinal ?? hoje,
      situacao: filtro.statusBruto,
      pagina: Math.floor(filtro.offset / itens),
      itensPorPagina: itens,
    });
    return { cobrancas: pagina.cobrancas.map(deCobrancaInter), temMais: pagina.temMais };
  }

  async obterPdf(idExterno: string) {
    return this.inter.obterPdf(idExterno);
  }

  async registrarWebhook(url: string) {
    await this.inter.registrarWebhook(url);
  }

  async normalizarWebhook(entrada: EntradaWebhook): Promise<EventoNormalizado[]> {
    return normalizarWebhookInter(entrada.corpo);
  }
}

export function criarAdaptadorInter(inter: ClienteHttpInter): AdaptadorInter {
  return new AdaptadorInter(inter);
}
