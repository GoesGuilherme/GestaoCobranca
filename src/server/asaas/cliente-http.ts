import { bandeiraCartaoSegura, finalCartaoSeguro } from "@/lib/cobranca";
import { somenteDocumento } from "@/lib/documento";
import { normalizarDinheiro } from "@/lib/dinheiro";
import {
  type AssinaturaAsaas,
  type AtualizacaoAssinaturaAsaas,
  type ClienteAsaas,
  type ClienteHttpAsaas,
  type CobrancaAsaas,
  ErroAsaas,
  idAsaasSeguro,
  type EncargosAsaas,
  type NovaAssinaturaAsaas,
  type NovaCobrancaAsaas,
  type NovoClienteAsaas,
  type PaginaCobrancasAsaas,
} from "./contrato";

const AGENTE = "GestaoCobranca";

type FetchComo = typeof fetch;

function redigir(texto: string, segredo: string): string {
  if (!segredo) return texto;
  return texto.split(segredo).join("[redigido]");
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

function descricoes(json: unknown, segredo: string): string {
  if (!json || typeof json !== "object" || !("errors" in json)) return "";
  const lista = (json as { errors: unknown }).errors;
  if (!Array.isArray(lista)) return "";
  const textos = lista
    .map((item) => {
      if (!item || typeof item !== "object" || !("description" in item)) return "";
      return typeof item.description === "string" ? item.description : "";
    })
    .filter(Boolean)
    .slice(0, 3);
  return redigir(textos.join(" "), segredo).slice(0, 300);
}

function lerCliente(json: unknown): ClienteAsaas {
  if (!json || typeof json !== "object") throw new ErroAsaas("Resposta de cliente inválida.", 502);
  const corpo = json as { id?: unknown; name?: unknown; cpfCnpj?: unknown };
  const id = textoDe(corpo.id);
  if (!id) throw new ErroAsaas("O Asaas não devolveu o cliente.", 502);
  return {
    id: idAsaasSeguro(id),
    nome: textoDe(corpo.name) ?? "",
    cpfCnpj: somenteDocumento(textoDe(corpo.cpfCnpj) ?? ""),
  };
}

function lerCobranca(json: unknown): CobrancaAsaas {
  if (!json || typeof json !== "object") throw new ErroAsaas("Resposta de cobrança inválida.", 502);
  const corpo = json as Record<string, unknown>;
  const id = textoDe(corpo.id);
  const customer = textoDe(corpo.customer);
  const vencimento = textoDe(corpo.dueDate);
  const valor = normalizarDinheiro(corpo.value);
  if (!id || !customer || !vencimento || !valor) {
    throw new ErroAsaas("O Asaas não devolveu a cobrança completa.", 502);
  }
  const assinatura = textoDe(corpo.subscription);
  return {
    id: idAsaasSeguro(id),
    customer: idAsaasSeguro(customer),
    subscription: assinatura ? idAsaasSeguro(assinatura) : null,
    valor,
    vencimento,
    status: textoDe(corpo.status) ?? "PENDING",
    formaCobranca: textoDe(corpo.billingType) ?? "BOLETO",
    boletoUrl: textoDe(corpo.bankSlipUrl),
    faturaUrl: textoDe(corpo.invoiceUrl),
    descricao: textoDe(corpo.description),
    excluida: corpo.deleted === true,
    referencia: textoDe(corpo.externalReference),
    cartao: cartaoSeguro(corpo.creditCard),
  };
}

function cartaoSeguro(valor: unknown): { bandeira: string | null; final: string | null } | null {
  if (!valor || typeof valor !== "object") return null;
  const corpo = valor as Record<string, unknown>;
  const bandeira = bandeiraCartaoSegura(corpo.creditCardBrand);
  const final = finalCartaoSeguro(corpo.creditCardNumber);
  if (!bandeira && !final) return null;
  return { bandeira, final };
}

function lerAssinatura(json: unknown): AssinaturaAsaas {
  if (!json || typeof json !== "object") throw new ErroAsaas("Resposta de assinatura inválida.", 502);
  const corpo = json as Record<string, unknown>;
  const id = textoDe(corpo.id);
  const customer = textoDe(corpo.customer);
  const proximoVencimento = textoDe(corpo.nextDueDate);
  const valor = normalizarDinheiro(corpo.value);
  if (!id || !customer || !proximoVencimento || !valor) {
    throw new ErroAsaas("O Asaas não devolveu a assinatura completa.", 502);
  }
  return {
    id: idAsaasSeguro(id),
    customer: idAsaasSeguro(customer),
    valor,
    proximoVencimento,
    ciclo: textoDe(corpo.cycle) ?? "MONTHLY",
    formaCobranca: textoDe(corpo.billingType) ?? "BOLETO",
    status: (textoDe(corpo.status) ?? "ACTIVE").toUpperCase(),
    descricao: textoDe(corpo.description),
  };
}

function lerPagina(json: unknown): PaginaCobrancasAsaas {
  if (!json || typeof json !== "object") throw new ErroAsaas("Resposta de cobranças inválida.", 502);
  const corpo = json as { data?: unknown; hasMore?: unknown };
  const lista = Array.isArray(corpo.data) ? corpo.data : [];
  const cobrancas: CobrancaAsaas[] = [];
  for (const item of lista) {
    try {
      cobrancas.push(lerCobranca(item));
    } catch {
      continue;
    }
  }
  return { cobrancas, temMais: corpo.hasMore === true };
}

function percentualJson(valor: string | null | undefined): string | null {
  if (valor == null || valor === "") return null;
  if (!/^\d+\.\d{2}$/.test(valor)) {
    throw new ErroAsaas("Percentual inválido para o Asaas.", 400);
  }
  return valor;
}

function anexarEncargos(json: string, encargos?: EncargosAsaas): string {
  if (!encargos) return json;
  const partes: string[] = [];
  const multa = percentualJson(encargos.multaPercentual);
  if (multa) partes.push(`"fine":{"value":${multa},"type":"PERCENTAGE"}`);
  const juros = percentualJson(encargos.jurosPercentual);
  if (juros) partes.push(`"interest":{"value":${juros}}`);
  const desconto = percentualJson(encargos.descontoPercentual);
  if (desconto) {
    const dias = encargos.descontoDiasAntes ?? 0;
    if (!Number.isInteger(dias) || dias < 0 || dias > 30) {
      throw new ErroAsaas("Os dias do desconto ficam entre 0 e 30.", 400);
    }
    partes.push(`"discount":{"value":${desconto},"dueDateLimitDays":${dias},"type":"PERCENTAGE"}`);
  }
  if (partes.length === 0) return json;
  return `${json.slice(0, -1)},${partes.join(",")}}`;
}

function corpoComValor(dados: Record<string, unknown>, valor: string, encargos?: EncargosAsaas): string {
  if (!/^\d+\.\d{2}$/.test(valor)) {
    throw new ErroAsaas("Valor inválido para o Asaas.", 400);
  }
  const json = JSON.stringify(dados);
  const comValor = json === "{}" ? `{"value":${valor}}` : `${json.slice(0, -1)},"value":${valor}}`;
  return anexarEncargos(comValor, encargos);
}

export function criarClienteHttpAsaas(opcoes: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchComo;
}): ClienteHttpAsaas {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const base = opcoes.baseUrl.replace(/\/$/, "");
  const apiKey = opcoes.apiKey;

  async function pedir(method: string, caminho: string, corpo?: string): Promise<{ status: number; json: unknown }> {
    let resposta: Response;
    try {
      resposta = await fetchImpl(`${base}${caminho}`, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": AGENTE,
          access_token: apiKey,
        },
        body: corpo,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ErroAsaas("Não foi possível falar com o Asaas.", 502);
    }

    const texto = await resposta.text();
    let json: unknown = null;
    if (texto) {
      try {
        json = JSON.parse(texto) as unknown;
      } catch {
        json = null;
      }
    }

    if (resposta.status === 401) {
      throw new ErroAsaas(
        "O Asaas recusou a chave. Confira se ela é do mesmo ambiente escolhido, sandbox ou produção.",
        401,
      );
    }
    if (!resposta.ok) {
      const detalhe = descricoes(json, apiKey);
      throw new ErroAsaas(detalhe || "O Asaas recusou a operação.", resposta.status);
    }
    return { status: resposta.status, json };
  }

  return {
    async testarConexao() {
      const { json } = await pedir("GET", "/myAccount");
      const corpo = json && typeof json === "object" ? (json as { name?: unknown; email?: unknown }) : {};
      return { nome: textoDe(corpo.name) ?? textoDe(corpo.email) ?? "Conta Asaas" };
    },

    async buscarClientePorDocumento(cpfCnpj) {
      const documento = somenteDocumento(cpfCnpj);
      const consulta = new URLSearchParams({ cpfCnpj: documento, limit: "1" });
      const { json } = await pedir("GET", `/customers?${consulta.toString()}`);
      const lista =
        json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
          ? (json as { data: unknown[] }).data
          : [];
      const primeiro = lista[0];
      if (!primeiro) return null;
      return lerCliente(primeiro);
    },

    async obterCliente(id) {
      try {
        const { json } = await pedir("GET", `/customers/${idAsaasSeguro(id)}`);
        return lerCliente(json);
      } catch (erro) {
        if (erro instanceof ErroAsaas && erro.status === 404) return null;
        throw erro;
      }
    },

    async criarCliente(dados: NovoClienteAsaas) {
      const corpo: Record<string, unknown> = {
        name: dados.nome,
        cpfCnpj: somenteDocumento(dados.cpfCnpj),
      };
      if (dados.email) corpo.email = dados.email;
      if (dados.telefone) corpo.mobilePhone = somenteDocumento(dados.telefone);
      if (dados.referencia) corpo.externalReference = dados.referencia;
      const { json } = await pedir("POST", "/customers", JSON.stringify(corpo));
      return lerCliente(json);
    },

    async criarCobranca(dados: NovaCobrancaAsaas) {
      const corpo: Record<string, unknown> = {
        customer: idAsaasSeguro(dados.customer),
        billingType: dados.formaCobranca,
        dueDate: dados.vencimento,
      };
      if (dados.descricao) corpo.description = dados.descricao;
      if (dados.referencia) corpo.externalReference = dados.referencia;
      const { json } = await pedir("POST", "/payments", corpoComValor(corpo, dados.valor, dados.encargos));
      return lerCobranca(json);
    },

    async buscarCobrancaPorReferencia(referencia) {
      const consulta = new URLSearchParams({ externalReference: referencia, limit: "10" });
      const { json } = await pedir("GET", `/payments?${consulta.toString()}`);
      const pagina = lerPagina(json);
      return pagina.cobrancas.find((cobranca) => !cobranca.excluida && cobranca.referencia === referencia) ?? null;
    },

    async cancelarCobranca(id) {
      await pedir("DELETE", `/payments/${idAsaasSeguro(id)}`);
    },

    async obterLinhaDigitavel(id) {
      try {
        const { json } = await pedir("GET", `/payments/${idAsaasSeguro(id)}/identificationField`);
        if (!json || typeof json !== "object") return null;
        return textoDe((json as { identificationField?: unknown }).identificationField);
      } catch (erro) {
        if (erro instanceof ErroAsaas && erro.status === 404) return null;
        throw erro;
      }
    },

    async obterPix(id) {
      try {
        const { json } = await pedir("GET", `/payments/${idAsaasSeguro(id)}/pixQrCode`);
        if (!json || typeof json !== "object") return null;
        return textoDe((json as { payload?: unknown }).payload);
      } catch (erro) {
        if (erro instanceof ErroAsaas && erro.status === 404) return null;
        throw erro;
      }
    },

    async criarAssinatura(dados: NovaAssinaturaAsaas) {
      const corpo: Record<string, unknown> = {
        customer: idAsaasSeguro(dados.customer),
        billingType: dados.formaCobranca,
        nextDueDate: dados.proximoVencimento,
        cycle: "MONTHLY",
      };
      if (dados.descricao) corpo.description = dados.descricao;
      if (dados.referencia) corpo.externalReference = dados.referencia;
      const { json } = await pedir("POST", "/subscriptions", corpoComValor(corpo, dados.valor, dados.encargos));
      return lerAssinatura(json);
    },

    async buscarAssinaturaPorReferencia(referencia) {
      const consulta = new URLSearchParams({ externalReference: referencia, limit: "10" });
      const { json } = await pedir("GET", `/subscriptions?${consulta.toString()}`);
      if (!json || typeof json !== "object" || !Array.isArray((json as { data?: unknown }).data)) {
        throw new ErroAsaas("Resposta de assinatura inválida.", 502);
      }
      const lista = (json as { data: unknown[] }).data;
      for (const item of lista) {
        if (!item || typeof item !== "object") continue;
        const corpo = item as { externalReference?: unknown; deleted?: unknown };
        if (corpo.deleted === true) continue;
        if (textoDe(corpo.externalReference) !== referencia) continue;
        const assinatura = lerAssinatura(item);
        if (assinatura.status === "ACTIVE") return assinatura;
      }
      return null;
    },

    async atualizarAssinatura(id, dados: AtualizacaoAssinaturaAsaas) {
      const corpo: Record<string, unknown> = { cycle: "MONTHLY" };
      if (dados.formaCobranca) corpo.billingType = dados.formaCobranca;
      if (dados.proximoVencimento) corpo.nextDueDate = dados.proximoVencimento;
      if (dados.descricao) corpo.description = dados.descricao;
      if (dados.status) corpo.status = dados.status;
      if (dados.atualizarPendentes) corpo.updatePendingPayments = true;
      const jsonCorpo = anexarEncargos(
        dados.valor ? corpoComValor(corpo, dados.valor) : JSON.stringify(corpo),
        dados.encargos,
      );
      const { json } = await pedir("PUT", `/subscriptions/${idAsaasSeguro(id)}`, jsonCorpo);
      return lerAssinatura(json);
    },

    async cancelarAssinatura(id) {
      await pedir("DELETE", `/subscriptions/${idAsaasSeguro(id)}`);
    },

    async listarCobrancasDoCliente(customer, offset, limit) {
      const consulta = new URLSearchParams({
        customer: idAsaasSeguro(customer),
        offset: String(offset),
        limit: String(limit),
      });
      const { json } = await pedir("GET", `/payments?${consulta.toString()}`);
      return lerPagina(json);
    },

    async listarCobrancasDaAssinatura(assinatura, offset, limit) {
      const consulta = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      });
      const { json } = await pedir(
        "GET",
        `/subscriptions/${idAsaasSeguro(assinatura)}/payments?${consulta.toString()}`,
      );
      return lerPagina(json);
    },
  };
}
