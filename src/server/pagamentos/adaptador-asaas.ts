import type { FormaCobranca } from "@/server/asaas/contrato";
import type {
  AssinaturaAsaas,
  AtualizacaoAssinaturaAsaas,
  ClienteHttpAsaas,
  CobrancaAsaas,
  NovaAssinaturaAsaas,
  NovaCobrancaAsaas,
} from "@/server/asaas/contrato";
import { statusNormalizado } from "@/lib/status-pagamento";
import { CAPACIDADES_ASAAS } from "./capacidades";
import { normalizarWebhookAsaas } from "./webhook-asaas";
import type {
  AssinaturaNormalizada,
  AtualizacaoAssinatura,
  CobrancaNormalizada,
  EntradaWebhook,
  EventoNormalizado,
  FormaCobrancaProvedor,
  MeioPagamento,
  NovaAssinatura,
  NovaCobranca,
  PaginaCobrancas,
  ProvedorPagamento,
} from "./tipos";

function formaAsaas(forma: FormaCobrancaProvedor): FormaCobranca {
  if (forma === "PIX") return "PIX";
  if (forma === "CARTAO") return "CREDIT_CARD";
  if (forma === "BOLETO") return "BOLETO";
  return "UNDEFINED";
}

function meioDe(forma: string): MeioPagamento | null {
  if (forma === "BOLETO") return "BOLETO";
  if (forma === "PIX") return "PIX";
  if (forma === "CREDIT_CARD") return "CARTAO";
  return null;
}

function deCobranca(cobranca: CobrancaAsaas): CobrancaNormalizada {
  return {
    idExterno: cobranca.id,
    idClienteExterno: cobranca.customer,
    idAssinaturaExterna: cobranca.subscription,
    valor: cobranca.valor,
    vencimento: cobranca.vencimento,
    statusBruto: cobranca.status,
    status: statusNormalizado(cobranca.status),
    formaCobranca: cobranca.formaCobranca,
    meio: meioDe(cobranca.formaCobranca),
    boletoUrl: cobranca.boletoUrl,
    faturaUrl: cobranca.faturaUrl,
    descricao: cobranca.descricao,
    excluida: cobranca.excluida,
    pagoEm: cobranca.pagoEm,
  };
}

function situacaoDe(status: string): AssinaturaNormalizada["situacao"] {
  const normal = status.toUpperCase();
  if (normal === "ACTIVE") return "ATIVA";
  if (normal === "INACTIVE") return "PAUSADA";
  if (normal === "CANCELADA" || normal === "DELETED") return "CANCELADA";
  return "OUTRA";
}

function deAssinatura(assinatura: AssinaturaAsaas): AssinaturaNormalizada {
  return {
    idExterno: assinatura.id,
    idClienteExterno: assinatura.customer,
    valor: assinatura.valor,
    proximoVencimento: assinatura.proximoVencimento,
    statusBruto: assinatura.status,
    situacao: situacaoDe(assinatura.status),
    formaCobranca: assinatura.formaCobranca,
    descricao: assinatura.descricao,
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
    status: dados.status === "PAUSADA" ? "INACTIVE" : dados.status === "ATIVA" ? "ACTIVE" : undefined,
    atualizarPendentes: dados.atualizarPendentes,
    encargos: dados.encargos,
  };
}

export class AdaptadorAsaas implements ProvedorPagamento {
  readonly provedor = "ASAAS" as const;

  constructor(readonly asaas: ClienteHttpAsaas) {}

  capacidades() {
    return CAPACIDADES_ASAAS;
  }

  async testarConexao() {
    const conta = await this.asaas.testarConexao();
    return { titular: conta.nome };
  }

  async criarCobranca(dados: NovaCobranca) {
    const existente = await this.asaas.buscarCobrancaPorReferencia(dados.chaveIdempotencia);
    if (existente) return deCobranca(existente);
    return deCobranca(await this.asaas.criarCobranca(novaCobrancaAsaas(dados)));
  }

  async consultarCobranca(idExterno: string) {
    return deCobranca(await this.asaas.obterCobranca(idExterno));
  }

  async cancelarCobranca(idExterno: string) {
    await this.asaas.cancelarCobranca(idExterno);
  }

  async listarCobrancas(filtro: { statusBruto?: string; offset: number; limit: number }): Promise<PaginaCobrancas> {
    const pagina = await this.asaas.listarCobrancas({
      status: filtro.statusBruto,
      offset: filtro.offset,
      limit: filtro.limit,
    });
    return { cobrancas: pagina.cobrancas.map(deCobranca), temMais: pagina.temMais };
  }

  async normalizarWebhook(entrada: EntradaWebhook): Promise<EventoNormalizado[]> {
    const evento = normalizarWebhookAsaas(entrada.corpo);
    return evento ? [evento] : [];
  }

  async criarAssinatura(dados: NovaAssinatura) {
    const existente = await this.asaas.buscarAssinaturaPorReferencia(dados.chaveIdempotencia);
    if (existente) return deAssinatura(existente);
    return deAssinatura(await this.asaas.criarAssinatura(novaAssinaturaAsaas(dados)));
  }

  async atualizarAssinatura(idExterno: string, dados: AtualizacaoAssinatura) {
    return deAssinatura(await this.asaas.atualizarAssinatura(idExterno, atualizacaoAsaas(dados)));
  }

  async cancelarAssinatura(idExterno: string) {
    await this.asaas.cancelarAssinatura(idExterno);
  }
}

export function criarAdaptadorAsaas(asaas: ClienteHttpAsaas): AdaptadorAsaas {
  return new AdaptadorAsaas(asaas);
}
