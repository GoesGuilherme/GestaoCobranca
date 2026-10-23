import { somenteDocumento } from "@/lib/documento";
import { normalizarDinheiro } from "@/lib/dinheiro";
import {
  type ClienteAsaas,
  type ClienteHttpAsaas,
  type CobrancaAsaas,
  ErroAsaas,
  idAsaasSeguro,
  type NovaCobrancaAsaas,
  type NovoClienteAsaas,
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
  return {
    id: idAsaasSeguro(id),
    customer: idAsaasSeguro(customer),
    valor,
    vencimento,
    status: textoDe(corpo.status) ?? "PENDING",
    formaCobranca: textoDe(corpo.billingType) ?? "BOLETO",
    boletoUrl: textoDe(corpo.bankSlipUrl),
    faturaUrl: textoDe(corpo.invoiceUrl),
    descricao: textoDe(corpo.description),
    excluida: corpo.deleted === true,
  };
}

function corpoComValor(dados: Record<string, unknown>, valor: string): string {
  if (!/^\d+\.\d{2}$/.test(valor)) {
    throw new ErroAsaas("Valor inválido para o Asaas.", 400);
  }
  const json = JSON.stringify(dados);
  if (json === "{}") return `{"value":${valor}}`;
  return `${json.slice(0, -1)},"value":${valor}}`;
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
      const { json } = await pedir("POST", "/payments", corpoComValor(corpo, dados.valor));
      return lerCobranca(json);
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
  };
}
