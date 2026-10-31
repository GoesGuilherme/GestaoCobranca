import { somenteDocumento } from "@/lib/documento";
import {
  type AssinaturaAsaas,
  type AtualizacaoAssinaturaAsaas,
  type ClienteAsaas,
  type ClienteHttpAsaas,
  type CobrancaAsaas,
  type EncargosAsaas,
  ErroAsaas,
  type NovaAssinaturaAsaas,
  type NovaCobrancaAsaas,
  type NovoClienteAsaas,
  type PaginaCobrancasAsaas,
  type VisualizacaoCobrancaAsaas,
} from "./contrato";

type ClienteGuardado = ClienteAsaas & { email: string; telefone: string; referencia: string };
export type EncargosGuardados = {
  multaPercentual: string | null;
  jurosPercentual: string | null;
  descontoPercentual: string | null;
  descontoDiasAntes: number | null;
};
type CobrancaGuardada = CobrancaAsaas & { encargos: EncargosGuardados };
type AssinaturaGuardada = AssinaturaAsaas & { referencia: string; excluida: boolean; encargos: EncargosGuardados };

function lerEncargos(dados?: EncargosAsaas): EncargosGuardados {
  const desconto = dados?.descontoPercentual ?? null;
  return {
    multaPercentual: dados?.multaPercentual ?? null,
    jurosPercentual: dados?.jurosPercentual ?? null,
    descontoPercentual: desconto,
    descontoDiasAntes: desconto ? (dados?.descontoDiasAntes ?? 0) : null,
  };
}

function mesclarEncargos(atual: EncargosGuardados, dados?: EncargosAsaas): EncargosGuardados {
  if (!dados) return atual;
  const proximo = { ...atual };
  if (dados.multaPercentual) proximo.multaPercentual = dados.multaPercentual;
  if (dados.jurosPercentual) proximo.jurosPercentual = dados.jurosPercentual;
  if (dados.descontoPercentual) {
    proximo.descontoPercentual = dados.descontoPercentual;
    proximo.descontoDiasAntes = dados.descontoDiasAntes ?? 0;
  }
  return proximo;
}

const ABERTAS = new Set(["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS", "DUNNING_REQUESTED"]);

export class AsaasMemoria implements ClienteHttpAsaas {
  clientes: ClienteGuardado[] = [];
  cobrancas = new Map<string, CobrancaGuardada>();
  assinaturas = new Map<string, AssinaturaGuardada>();
  falharConexao = false;
  segurarCriacao: Promise<void> | null = null;
  lancarDepoisDeCriarCobranca = false;
  lancarDepoisDeCriarAssinatura = false;
  cancelarCobrancaLanca = false;
  cancelarAssinaturaLanca = false;
  visualizacoes = new Map<string, VisualizacaoCobrancaAsaas>();
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

  async obterCliente(id: string) {
    return this.clientes.find((cliente) => cliente.id === id) ?? null;
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
    if (this.segurarCriacao) await this.segurarCriacao;
    if (!this.clientes.some((cliente) => cliente.id === dados.customer)) {
      throw new ErroAsaas("Cliente não encontrado.", 404);
    }
    const cobranca = this.guardarCobranca({
      customer: dados.customer,
      subscription: null,
      valor: dados.valor,
      vencimento: dados.vencimento,
      formaCobranca: dados.formaCobranca,
      descricao: dados.descricao ?? null,
      referencia: dados.referencia ?? "",
      encargos: lerEncargos(dados.encargos),
    });
    if (this.lancarDepoisDeCriarCobranca) {
      throw new ErroAsaas("Não foi possível falar com o Asaas.", 504);
    }
    return cobranca;
  }

  async buscarCobrancaPorReferencia(referencia: string) {
    return (
      [...this.cobrancas.values()].find((cobranca) => cobranca.referencia === referencia && !cobranca.excluida) ?? null
    );
  }

  async cancelarCobranca(id: string) {
    if (this.cancelarCobrancaLanca) {
      throw new ErroAsaas("Não foi possível falar com o Asaas.", 504);
    }
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

  async obterVisualizacao(id: string) {
    return this.visualizacoes.get(id) ?? { faturaEm: null, boletoEm: null };
  }

  async criarAssinatura(dados: NovaAssinaturaAsaas) {
    if (this.segurarCriacao) await this.segurarCriacao;
    if (!this.clientes.some((cliente) => cliente.id === dados.customer)) {
      throw new ErroAsaas("Cliente não encontrado.", 404);
    }
    this.sequencia += 1;
    const id = `sub_${this.prefixo}_${this.sequencia}`;
    const assinatura: AssinaturaGuardada = {
      id,
      customer: dados.customer,
      valor: dados.valor,
      proximoVencimento: dados.proximoVencimento,
      ciclo: "MONTHLY",
      formaCobranca: dados.formaCobranca,
      status: "ACTIVE",
      descricao: dados.descricao ?? null,
      referencia: dados.referencia ?? "",
      excluida: false,
      encargos: lerEncargos(dados.encargos),
    };
    this.assinaturas.set(id, assinatura);
    this.guardarCobranca({
      customer: dados.customer,
      subscription: id,
      valor: dados.valor,
      vencimento: dados.proximoVencimento,
      formaCobranca: dados.formaCobranca,
      descricao: dados.descricao ?? null,
      referencia: "",
      encargos: assinatura.encargos,
    });
    if (this.lancarDepoisDeCriarAssinatura) {
      throw new ErroAsaas("Não foi possível falar com o Asaas.", 504);
    }
    return assinatura;
  }

  async buscarAssinaturaPorReferencia(referencia: string) {
    return (
      [...this.assinaturas.values()].find(
        (assinatura) => assinatura.referencia === referencia && !assinatura.excluida && assinatura.status === "ACTIVE",
      ) ?? null
    );
  }

  async atualizarAssinatura(id: string, dados: AtualizacaoAssinaturaAsaas) {
    const assinatura = this.assinaturas.get(id);
    if (!assinatura || assinatura.excluida) throw new ErroAsaas("Assinatura não encontrada.", 404);
    if (dados.formaCobranca) assinatura.formaCobranca = dados.formaCobranca;
    if (dados.valor) assinatura.valor = dados.valor;
    if (dados.proximoVencimento) assinatura.proximoVencimento = dados.proximoVencimento;
    if (dados.descricao) assinatura.descricao = dados.descricao;
    if (dados.status) assinatura.status = dados.status;
    assinatura.encargos = mesclarEncargos(assinatura.encargos, dados.encargos);
    if (dados.atualizarPendentes) {
      for (const cobranca of this.cobrancas.values()) {
        if (cobranca.subscription !== id || cobranca.excluida || !ABERTAS.has(cobranca.status)) continue;
        if (dados.valor) cobranca.valor = dados.valor;
        if (dados.formaCobranca) cobranca.formaCobranca = dados.formaCobranca;
        if (dados.descricao) cobranca.descricao = dados.descricao;
      }
    }
    return assinatura;
  }

  async cancelarAssinatura(id: string) {
    if (this.cancelarAssinaturaLanca) {
      throw new ErroAsaas("Não foi possível falar com o Asaas.", 504);
    }
    const assinatura = this.assinaturas.get(id);
    if (!assinatura || assinatura.excluida) throw new ErroAsaas("Assinatura não encontrada.", 404);
    assinatura.excluida = true;
    assinatura.status = "INACTIVE";
    for (const cobranca of this.cobrancas.values()) {
      if (cobranca.subscription === id && ABERTAS.has(cobranca.status)) cobranca.excluida = true;
    }
  }

  async listarCobrancasDoCliente(customer: string, offset: number, limit: number) {
    return this.paginar(
      [...this.cobrancas.values()].filter((cobranca) => cobranca.customer === customer),
      offset,
      limit,
    );
  }

  async listarCobrancasDaAssinatura(assinatura: string, offset: number, limit: number) {
    if (!this.assinaturas.has(assinatura)) throw new ErroAsaas("Assinatura não encontrada.", 404);
    return this.paginar(
      [...this.cobrancas.values()].filter((cobranca) => cobranca.subscription === assinatura),
      offset,
      limit,
    );
  }

  private guardarCobranca(dados: {
    customer: string;
    subscription: string | null;
    valor: string;
    vencimento: string;
    formaCobranca: string;
    descricao: string | null;
    referencia: string;
    encargos: EncargosGuardados;
  }) {
    this.sequencia += 1;
    const id = `pay_${this.prefixo}_${this.sequencia}`;
    const cobranca: CobrancaGuardada = {
      id,
      customer: dados.customer,
      subscription: dados.subscription,
      valor: dados.valor,
      vencimento: dados.vencimento,
      status: "PENDING",
      formaCobranca: dados.formaCobranca,
      boletoUrl:
        dados.formaCobranca === "PIX" || dados.formaCobranca === "CREDIT_CARD"
          ? null
          : `https://sandbox.asaas.com/b/pdf/${id}`,
      faturaUrl: `https://sandbox.asaas.com/i/${id}`,
      descricao: dados.descricao,
      excluida: false,
      referencia: dados.referencia,
      encargos: dados.encargos,
    };
    this.cobrancas.set(id, cobranca);
    return cobranca;
  }

  private paginar(lista: CobrancaGuardada[], offset: number, limit: number): PaginaCobrancasAsaas {
    const inicio = Math.max(0, offset);
    const fim = inicio + Math.max(1, limit);
    return {
      cobrancas: lista.slice(inicio, fim),
      temMais: fim < lista.length,
    };
  }
}
