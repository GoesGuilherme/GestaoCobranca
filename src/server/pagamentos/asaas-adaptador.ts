import { dataPagamentoAsaas } from "@/server/asaas/data-pagamento";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { normalizarStatus } from "@/lib/status-cobranca";
import {
  type AssinaturaAsaas,
  type AtualizacaoAssinaturaAsaas,
  type ClienteHttpAsaas,
  type CobrancaAsaas,
  ErroAsaas,
  type FormaCobranca,
  type NovaAssinaturaAsaas,
  type NovaCobrancaAsaas,
} from "@/server/asaas/contrato";
import type {
  AssinaturaNormalizada,
  AtualizacaoAssinatura,
  CapacidadesProvedor,
  CobrancaNormalizada,
  EventoNormalizado,
  FormaCobrancaProvedor,
  MeioCobranca,
  NovaAssinatura,
  NovaCobranca,
  PaginaCobrancas,
  ProvedorPagamento,
} from "./contrato";

export const CAPACIDADES_ASAAS: CapacidadesProvedor = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: true,
  assinaturaNativa: true,
  pixAutomatico: false,
  visualizacao: true,
  precisaClienteRemoto: true,
  editarVencimento: true,
  webhookAssinado: false,
  confirmarBaixaPorConsulta: false,
};

const VISUALIZACAO = new Set(["PAYMENT_CHECKOUT_VIEWED", "PAYMENT_BANK_SLIP_VIEWED"]);

function formaAsaas(forma: FormaCobrancaProvedor): FormaCobranca {
  if (forma === "BOLETO_PIX") return "UNDEFINED";
  return forma;
}

function meioDe(forma: string): MeioCobranca | null {
  if (forma === "BOLETO") return "BOLETO";
  if (forma === "PIX") return "PIX";
  if (forma === "CREDIT_CARD") return "CARTAO";
  if (forma === "UNDEFINED" || forma === "BOLETO_PIX") return "BOLETO_PIX";
  return null;
}

export function cobrancaNormalizada(cobranca: CobrancaAsaas): CobrancaNormalizada & { bruto: CobrancaAsaas } {
  return {
    idExterno: cobranca.id,
    idClienteExterno: cobranca.customer,
    idAssinaturaExterna: cobranca.subscription,
    status: cobranca.excluida ? "CANCELADA" : normalizarStatus(cobranca.status, "ASAAS"),
    statusBruto: cobranca.status,
    valor: cobranca.valor,
    vencimento: cobranca.vencimento,
    pagoEm: cobranca.pagoEm,
    meio: meioDe(cobranca.formaCobranca),
    boletoUrl: cobranca.boletoUrl,
    faturaUrl: cobranca.faturaUrl,
    descricao: cobranca.descricao,
    excluida: cobranca.excluida,
    chaveIdempotencia: cobranca.referencia,
    bruto: cobranca,
  };
}

function assinaturaNormalizada(assinatura: AssinaturaAsaas): AssinaturaNormalizada & { bruto: AssinaturaAsaas } {
  return {
    idExterno: assinatura.id,
    idClienteExterno: assinatura.customer,
    valor: assinatura.valor,
    proximoVencimento: assinatura.proximoVencimento,
    statusBruto: assinatura.status,
    formaCobranca: assinatura.formaCobranca,
    descricao: assinatura.descricao,
    bruto: assinatura,
  };
}

function novaCobrancaAsaas(dados: NovaCobranca): NovaCobrancaAsaas {
  return {
    customer: dados.idClienteExterno,
    formaCobranca: formaAsaas(dados.formaCobranca),
    valor: dados.valor,
    vencimento: dados.vencimento,
    descricao: dados.descricao,
    referencia: dados.chaveIdempotencia,
    encargos: dados.encargos,
  };
}

function novaAssinaturaAsaas(dados: NovaAssinatura): NovaAssinaturaAsaas {
  return {
    customer: dados.idClienteExterno,
    formaCobranca: formaAsaas(dados.formaCobranca),
    valor: dados.valor,
    proximoVencimento: dados.proximoVencimento,
    descricao: dados.descricao,
    referencia: dados.chaveIdempotencia,
    encargos: dados.encargos,
  };
}

function atualizacaoAsaas(dados: AtualizacaoAssinatura): AtualizacaoAssinaturaAsaas {
  return {
    formaCobranca: dados.formaCobranca ? formaAsaas(dados.formaCobranca) : undefined,
    valor: dados.valor,
    proximoVencimento: dados.proximoVencimento,
    descricao: dados.descricao,
    status: dados.status,
    atualizarPendentes: dados.atualizarPendentes,
    encargos: dados.encargos,
  };
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function idExterno(valor: unknown): string | null {
  const id = texto(valor, 80);
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return id;
}

function valorPago(pagamento: Record<string, unknown>, status: string): string | null {
  if (normalizarStatus(status, "ASAAS") !== "PAGA") return null;
  const bruto = pagamento.value;
  if (typeof bruto !== "number" && typeof bruto !== "string") return null;
  return normalizarDinheiro(bruto);
}

/**
 * Traduz o POST do Asaas para o evento comum. Não autentica: a rota já
 * conferiu o token. Corpo inválido devolve lista vazia.
 */
export function normalizarCorpoWebhookAsaas(corpo: unknown): EventoNormalizado[] {
  if (!corpo || typeof corpo !== "object") return [];
  const evento = corpo as { id?: unknown; event?: unknown; payment?: unknown };
  const idEvento = texto(evento.id, 200);
  const tipo = texto(evento.event, 80);
  if (!idEvento || !tipo) return [];
  const pagamento =
    evento.payment && typeof evento.payment === "object" ? (evento.payment as Record<string, unknown>) : null;
  const statusBruto = pagamento ? texto(pagamento.status, 40)?.toUpperCase() ?? null : null;
  const visualizacao = VISUALIZACAO.has(tipo);
  const excluida = tipo === "PAYMENT_DELETED" || pagamento?.deleted === true;
  const status = visualizacao ? null : statusBruto ? normalizarStatus(statusBruto, "ASAAS") : null;
  const pagoEmIso = pagamento && status === "PAGA" ? dataPagamentoAsaas(pagamento) : null;
  return [
    {
      idEvento,
      tipo,
      idExterno: pagamento ? idExterno(pagamento.id) : null,
      status: excluida && !visualizacao ? "CANCELADA" : status,
      statusBruto,
      pagoEm: pagoEmIso ? new Date(`${pagoEmIso}T00:00:00.000Z`) : null,
      valorPago: pagamento && statusBruto ? valorPago(pagamento, statusBruto) : null,
      meio: pagamento ? meioDe(texto(pagamento.billingType, 32) ?? "") : null,
      visualizacao,
      excluida,
      bruto: corpo,
    },
  ];
}

export class AdaptadorAsaas implements ProvedorPagamento {
  readonly provedor = "ASAAS" as const;

  constructor(private readonly http: ClienteHttpAsaas) {}

  capacidades(): CapacidadesProvedor {
    return CAPACIDADES_ASAAS;
  }

  async testarConexao() {
    const conta = await this.http.testarConexao();
    return { titular: conta.nome };
  }

  async criarCobranca(dados: NovaCobranca) {
    return cobrancaNormalizada(await this.http.criarCobranca(novaCobrancaAsaas(dados)));
  }

  async consultarCobranca(idExterno: string) {
    const cobranca = await this.http.obterCobranca(idExterno);
    if (!cobranca) throw new ErroAsaas("Cobrança não encontrada no Asaas.", 404);
    return cobrancaNormalizada(cobranca);
  }

  async buscarCobrancaPorIdempotencia(chave: string) {
    const cobranca = await this.http.buscarCobrancaPorReferencia(chave);
    return cobranca ? cobrancaNormalizada(cobranca) : null;
  }

  async cancelarCobranca(idExterno: string) {
    await this.http.cancelarCobranca(idExterno);
  }

  async obterLinhaDigitavel(idExterno: string) {
    return this.http.obterLinhaDigitavel(idExterno);
  }

  async obterPix(idExterno: string) {
    return this.http.obterPix(idExterno);
  }

  async listarCobrancas(filtro: { statusBruto?: string; offset: number; limit: number }): Promise<PaginaCobrancas> {
    const pagina = await this.http.listarCobrancas({
      status: filtro.statusBruto,
      offset: filtro.offset,
      limit: filtro.limit,
    });
    return { cobrancas: pagina.cobrancas.map(cobrancaNormalizada), temMais: pagina.temMais };
  }

  async normalizarWebhook(entrada: { headers: Headers; corpo: unknown }) {
    return normalizarCorpoWebhookAsaas(entrada.corpo);
  }

  async criarAssinatura(dados: NovaAssinatura) {
    return assinaturaNormalizada(await this.http.criarAssinatura(novaAssinaturaAsaas(dados)));
  }

  async buscarAssinaturaPorIdempotencia(chave: string) {
    const assinatura = await this.http.buscarAssinaturaPorReferencia(chave);
    return assinatura ? assinaturaNormalizada(assinatura) : null;
  }

  async atualizarAssinatura(idExterno: string, dados: AtualizacaoAssinatura) {
    return assinaturaNormalizada(await this.http.atualizarAssinatura(idExterno, atualizacaoAsaas(dados)));
  }

  async cancelarAssinatura(idExterno: string) {
    await this.http.cancelarAssinatura(idExterno);
  }

  async listarCobrancasDaAssinatura(idExterno: string, offset: number, limit: number): Promise<PaginaCobrancas> {
    const pagina = await this.http.listarCobrancasDaAssinatura(idExterno, offset, limit);
    return { cobrancas: pagina.cobrancas.map(cobrancaNormalizada), temMais: pagina.temMais };
  }
}

export function ehAdaptadorAsaas(provedor: ProvedorPagamento): provedor is AdaptadorAsaas {
  return provedor.provedor === "ASAAS";
}
