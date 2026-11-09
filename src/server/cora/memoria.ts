import { ErroAplicacao } from "@/server/erros";
import type { ClienteHttpCora, FaturaCora, NovaFaturaCora } from "./contrato";

export class CoraMemoria implements ClienteHttpCora {
  readonly faturas = new Map<string, FaturaCora>();
  readonly chaves = new Map<string, string>();
  consultas = 0;
  falharConsulta = false;
  falharCriacao = false;
  sequencia = 0;

  async testarConexao() {
    return { titular: "Conta Cora conectada" };
  }

  async criarFatura(dados: NovaFaturaCora): Promise<FaturaCora> {
    const existente = this.chaves.get(dados.idempotencyKey);
    if (existente) {
      const achada = this.faturas.get(existente);
      if (!achada) throw new ErroAplicacao("Fatura não encontrada na Cora.", 404, "cora_recusou");
      return achada;
    }
    if (this.falharCriacao) throw new ErroAplicacao("Não foi possível falar com a Cora.", 504, "cora_timeout");
    this.sequencia += 1;
    const id = `inv_mem_${this.sequencia}`;
    const fatura: FaturaCora = {
      id,
      status: "OPEN",
      valor: dados.valor,
      valorPago: "0.00",
      vencimento: dados.vencimento,
      pagoEm: null,
      codigo: dados.codigo,
      linhaDigitavel: "23793381286008301352856000063307789840000010000",
      codigoBarras: "23797898400000100003381260083013525600006330",
      boletoUrl: "https://api.stage.cora.com.br/boletos/exemplo.pdf",
      pixCopiaCola: "00020126580014br.gov.bcb.pix",
      descricao: dados.descricao ?? null,
      metodo: null,
    };
    this.faturas.set(id, fatura);
    this.chaves.set(dados.idempotencyKey, id);
    return fatura;
  }

  async consultarFatura(id: string): Promise<FaturaCora> {
    this.consultas += 1;
    if (this.falharConsulta) throw new ErroAplicacao("Não foi possível falar com a Cora.", 504, "cora_timeout");
    const achada = this.faturas.get(id);
    if (!achada) throw new ErroAplicacao("Fatura não encontrada na Cora.", 404, "cora_recusou");
    return achada;
  }

  async cancelarFatura(id: string) {
    const achada = await this.consultarFatura(id);
    if (achada.status === "PAID") {
      throw new ErroAplicacao("A Cora recusou a chamada (422). O boleto já foi pago.", 422, "cora_recusou");
    }
    achada.status = "CANCELLED";
  }

  marcar(id: string, status: string, pagoEm?: string) {
    const achada = this.faturas.get(id);
    if (!achada) throw new ErroAplicacao("Fatura não encontrada na Cora.", 404, "cora_recusou");
    achada.status = status;
    if (pagoEm) achada.pagoEm = pagoEm;
    if (status === "PAID") achada.metodo = "PIX";
  }
}
