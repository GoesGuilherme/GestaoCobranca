import { randomUUID } from "node:crypto";
import { ErroAplicacao } from "@/server/erros";
import type {
  CobrancaInter,
  ClienteHttpInter,
  FiltroCobrancasInter,
  NovaCobrancaInter,
  PaginaCobrancasInter,
} from "./contrato";

export class InterMemoria implements ClienteHttpInter {
  readonly cobrancas: CobrancaInter[] = [];
  webhookUrl: string | null = null;
  falharConsulta = false;
  titular: string;

  constructor(conta = "1234567") {
    this.titular = `Inter · conta ${conta}`;
  }

  async testarConexao() {
    return { titular: this.titular };
  }

  async buscarPorSeuNumero(seuNumero: string, vencimento: string) {
    return (
      this.cobrancas.find(
        (item) => item.seuNumero.toUpperCase() === seuNumero.toUpperCase() && item.dataVencimento === vencimento,
      ) ?? null
    );
  }

  async criarCobranca(dados: NovaCobrancaInter) {
    const existente = await this.buscarPorSeuNumero(dados.seuNumero, dados.dataVencimento);
    if (existente) return existente;
    const numero = Number(dados.valorNominal);
    if (!Number.isFinite(numero) || numero < 2.5) {
      throw new ErroAplicacao("O Inter aceita cobrança entre R$ 2,50 e R$ 99.999.999,99.", 400, "valor_invalido");
    }
    const criada: CobrancaInter = {
      codigoSolicitacao: randomUUID(),
      seuNumero: dados.seuNumero,
      situacao: "A_RECEBER",
      dataVencimento: dados.dataVencimento,
      dataSituacao: dados.dataVencimento,
      valorNominal: numero.toFixed(2),
      valorTotalRecebido: null,
      origemRecebimento: null,
      linhaDigitavel: "34191.79001 01043.510047 91020.150008 1 89010000001000",
      codigoBarras: "34191890100000010001790001043510049102015000",
      pixCopiaCola: `00020126580014BR.GOV.BCB.PIX0136${dados.seuNumero}`,
      descricao: dados.descricao ?? null,
    };
    this.cobrancas.push(criada);
    return criada;
  }

  async consultarCobranca(codigoSolicitacao: string) {
    if (this.falharConsulta) throw new ErroAplicacao("O Banco Inter não respondeu a tempo.", 504, "inter_timeout");
    const achada = this.cobrancas.find((item) => item.codigoSolicitacao === codigoSolicitacao);
    if (!achada) throw new ErroAplicacao("Cobrança não encontrada no Inter.", 404, "inter_recusou");
    return achada;
  }

  async cancelarCobranca(codigoSolicitacao: string) {
    const achada = await this.consultarCobranca(codigoSolicitacao);
    achada.situacao = "CANCELADO";
  }

  async editarCobranca(codigoSolicitacao: string, dados: { valor?: string; vencimento?: string }) {
    const achada = await this.consultarCobranca(codigoSolicitacao);
    if (achada.situacao === "CANCELADO" || achada.situacao === "RECEBIDO" || achada.situacao === "PROTESTO") {
      throw new ErroAplicacao("O Inter só altera cobrança em aberto ou atrasada.", 422, "inter_recusou");
    }
    if (dados.valor) achada.valorNominal = Number(dados.valor).toFixed(2);
    if (dados.vencimento) achada.dataVencimento = dados.vencimento;
    const centavos = achada.valorNominal.replace(/\D/g, "");
    achada.linhaDigitavel = `34191.79001 01043.510047 91020.150008 1 ${centavos.padStart(14, "0")}`;
    achada.pixCopiaCola = `00020126580014BR.GOV.BCB.PIX0136${achada.codigoSolicitacao}${centavos}`;
  }

  async obterPdf(codigoSolicitacao: string) {
    await this.consultarCobranca(codigoSolicitacao);
    return Buffer.from("%PDF-1.4 inter").toString("base64");
  }

  async listarCobrancas(filtro: FiltroCobrancasInter): Promise<PaginaCobrancasInter> {
    const filtradas = this.cobrancas.filter((item) => {
      if (item.dataVencimento < filtro.dataInicial || item.dataVencimento > filtro.dataFinal) return false;
      if (filtro.seuNumero && item.seuNumero !== filtro.seuNumero) return false;
      if (filtro.situacao && item.situacao !== filtro.situacao) return false;
      return true;
    });
    const inicio = filtro.pagina * filtro.itensPorPagina;
    const pagina = filtradas.slice(inicio, inicio + filtro.itensPorPagina);
    return { cobrancas: pagina, temMais: inicio + pagina.length < filtradas.length };
  }

  async registrarWebhook(url: string) {
    if (!url.startsWith("https://")) {
      throw new ErroAplicacao("O webhook do Inter precisa de uma URL pública em HTTPS.", 422, "webhook_url");
    }
    this.webhookUrl = url;
  }

  marcar(codigoSolicitacao: string, situacao: string, pagoEm?: string) {
    const achada = this.cobrancas.find((item) => item.codigoSolicitacao === codigoSolicitacao);
    if (!achada) throw new ErroAplicacao("Cobrança não encontrada no Inter.", 404, "inter_recusou");
    achada.situacao = situacao;
    if (pagoEm) {
      achada.dataSituacao = pagoEm;
      achada.valorTotalRecebido = achada.valorNominal;
      achada.origemRecebimento = "PIX";
    }
  }
}
