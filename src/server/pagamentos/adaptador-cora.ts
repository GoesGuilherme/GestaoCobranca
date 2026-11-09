import { statusNormalizado, STATUS_NORMALIZADO } from "@/lib/status-pagamento";
import type { ClienteHttpCora, FaturaCora } from "@/server/cora/contrato";
import { ErroAplicacao } from "@/server/erros";
import { CAPACIDADES_CORA } from "./capacidades";
import type { CobrancaNormalizada, EntradaWebhook, EventoNormalizado, MeioPagamento, NovaCobranca, ProvedorPagamento } from "./tipos";

function meioDe(metodo: FaturaCora["metodo"]): MeioPagamento | null {
  if (metodo === "PIX") return "PIX";
  if (metodo === "BANK_SLIP") return "BOLETO";
  return null;
}

export function deFaturaCora(fatura: FaturaCora): CobrancaNormalizada {
  const status = statusNormalizado(fatura.status, "CORA");
  return {
    idExterno: fatura.id,
    idClienteExterno: null,
    idAssinaturaExterna: null,
    valor: fatura.valor,
    vencimento: fatura.vencimento,
    statusBruto: fatura.status,
    status,
    formaCobranca: "BOLETO",
    meio: meioDe(fatura.metodo),
    boletoUrl: fatura.boletoUrl,
    faturaUrl: null,
    linhaDigitavel: fatura.linhaDigitavel,
    codigoBarras: fatura.codigoBarras,
    pixCopiaCola: fatura.pixCopiaCola,
    descricao: fatura.descricao,
    excluida: status === STATUS_NORMALIZADO.CANCELADO,
    pagoEm: status === STATUS_NORMALIZADO.PAGO ? fatura.pagoEm : null,
  };
}

export class AdaptadorCora implements ProvedorPagamento {
  readonly provedor = "CORA" as const;

  constructor(readonly cora: ClienteHttpCora) {}

  capacidades() {
    return CAPACIDADES_CORA;
  }

  testarConexao() {
    return this.cora.testarConexao();
  }

  async criarCobranca(dados: NovaCobranca) {
    if (dados.formaCobranca === "CARTAO") {
      throw new ErroAplicacao("A Cora, nesta cobrança, não recebe cartão. Use boleto com Pix.", 422, "forma_indisponivel");
    }
    if (!dados.pagador) {
      throw new ErroAplicacao("A Cora precisa do nome, documento e endereço do pagador.", 422, "pagador_incompleto");
    }
    const criada = await this.cora.criarFatura({
      idempotencyKey: dados.chaveIdempotencia,
      codigo: dados.chaveIdempotencia,
      valor: dados.valor,
      vencimento: dados.vencimento,
      descricao: dados.descricao,
      pagador: dados.pagador,
      encargos: dados.encargos,
    });
    return deFaturaCora(criada);
  }

  async consultarCobranca(idExterno: string) {
    return deFaturaCora(await this.cora.consultarFatura(idExterno));
  }

  async cancelarCobranca(idExterno: string) {
    await this.cora.cancelarFatura(idExterno);
  }

  async normalizarWebhook(entrada: EntradaWebhook): Promise<EventoNormalizado[]> {
    void entrada;
    return [];
  }
}

export function criarAdaptadorCora(cora: ClienteHttpCora): AdaptadorCora {
  return new AdaptadorCora(cora);
}
