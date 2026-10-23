import { somenteDocumento } from "@/lib/documento";
import {
  type ClienteAsaas,
  type ClienteHttpAsaas,
  type CobrancaAsaas,
  ErroAsaas,
  type NovaCobrancaAsaas,
  type NovoClienteAsaas,
} from "./contrato";

type ClienteGuardado = ClienteAsaas & { email: string; telefone: string; referencia: string };
type CobrancaGuardada = CobrancaAsaas;

export class AsaasMemoria implements ClienteHttpAsaas {
  clientes: ClienteGuardado[] = [];
  cobrancas = new Map<string, CobrancaGuardada>();
  falharConexao = false;
  private sequencia = 0;

  constructor(private prefixo = "mem") {}

  async testarConexao() {
    if (this.falharConexao) {
      throw new ErroAsaas(
        "O Asaas recusou a chave. Confira se ela é do mesmo ambiente escolhido, sandbox ou produção.",
        401,
      );
    }
    return { nome: "Conta sandbox simulada" };
  }

  async buscarClientePorDocumento(cpfCnpj: string) {
    const documento = somenteDocumento(cpfCnpj);
    return this.clientes.find((cliente) => cliente.cpfCnpj === documento) ?? null;
  }

  async criarCliente(dados: NovoClienteAsaas) {
    this.sequencia += 1;
    const cliente: ClienteGuardado = {
      id: `cus_${this.prefixo}_${this.sequencia}`,
      nome: dados.nome,
      cpfCnpj: somenteDocumento(dados.cpfCnpj),
      email: dados.email ?? "",
      telefone: somenteDocumento(dados.telefone ?? ""),
      referencia: dados.referencia ?? "",
    };
    this.clientes.push(cliente);
    return cliente;
  }

  async criarCobranca(dados: NovaCobrancaAsaas) {
    if (!this.clientes.some((cliente) => cliente.id === dados.customer)) {
      throw new ErroAsaas("Cliente não encontrado.", 404);
    }
    this.sequencia += 1;
    const id = `pay_${this.prefixo}_${this.sequencia}`;
    const cobranca: CobrancaGuardada = {
      id,
      customer: dados.customer,
      valor: dados.valor,
      vencimento: dados.vencimento,
      status: "PENDING",
      formaCobranca: dados.formaCobranca,
      boletoUrl: dados.formaCobranca === "PIX" ? null : `https://sandbox.asaas.com/b/pdf/${id}`,
      faturaUrl: `https://sandbox.asaas.com/i/${id}`,
      descricao: dados.descricao ?? null,
      excluida: false,
    };
    this.cobrancas.set(id, cobranca);
    return cobranca;
  }

  async cancelarCobranca(id: string) {
    const cobranca = this.cobrancas.get(id);
    if (!cobranca) throw new ErroAsaas("Cobrança não encontrada.", 404);
    cobranca.excluida = true;
  }

  async obterLinhaDigitavel(id: string) {
    const cobranca = this.cobrancas.get(id);
    if (!cobranca || cobranca.formaCobranca === "PIX") return null;
    return "2379338128600000000030000000040184340000018990";
  }

  async obterPix(id: string) {
    const cobranca = this.cobrancas.get(id);
    if (!cobranca || cobranca.formaCobranca === "BOLETO") return null;
    return `00020126580014br.gov.bcb.pix${id}`;
  }
}
