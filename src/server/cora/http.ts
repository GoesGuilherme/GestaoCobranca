import { createHash } from "node:crypto";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { ErroAplicacao } from "@/server/erros";
import { baseCora, credenciaisParceiroCora, redirectCora, urlCoraPermitida } from "./ambiente";
import type { FaturaCora, NovaFaturaCora, PedidoCora, RespostaCoraHttp, TokensCora, TransporteCora } from "./contrato";
import { GATILHOS_WEBHOOK_CORA } from "./contrato";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function transporteHttpsCora(): TransporteCora {
  return async (pedido) => {
    if (!urlCoraPermitida(pedido.url)) {
      throw new ErroAplicacao("Endereço da Cora recusado.", 500, "cora_url");
    }
    const controle = AbortSignal.timeout(20_000);
    let resposta: Response;
    try {
      resposta = await fetch(pedido.url, {
        method: pedido.method,
        headers: pedido.headers,
        body: pedido.body,
        signal: controle,
      });
    } catch {
      throw new ErroAplicacao("Não foi possível falar com a Cora.", 504, "cora_timeout");
    }
    return { status: resposta.status, body: await resposta.text() };
  };
}

export function autorizacaoBasica(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

export function urlAutorizacaoCora(): string {
  const { clientId } = credenciaisParceiroCora();
  const destino = new URL(`${baseCora()}/oauth/authorize`);
  destino.searchParams.set("client_id", clientId);
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("redirect_uri", redirectCora());
  destino.searchParams.set("scopes", "invoice");
  return destino.toString();
}

function lerJson(corpo: string, vazio: unknown = null): unknown {
  if (!corpo.trim()) return vazio;
  try {
    return JSON.parse(corpo) as unknown;
  } catch {
    throw new ErroAplicacao("A Cora respondeu em um formato inesperado.", 502, "cora_resposta");
  }
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function mensagemCora(status: number, corpo: string): string {
  let detalhe = "";
  try {
    const json = JSON.parse(corpo) as { message?: unknown; error?: unknown; code?: unknown };
    detalhe = texto(json.message, 160) ?? texto(json.error, 80) ?? "";
    if (/token|secret|authorization/i.test(detalhe)) detalhe = "";
  } catch {
    detalhe = "";
  }
  if (!detalhe) return `A Cora recusou a chamada (${status}).`;
  return `A Cora recusou a chamada (${status}). ${detalhe}`.slice(0, 240);
}

export function lerTokensCora(corpo: string): TokensCora {
  const json = lerJson(corpo);
  if (!json || typeof json !== "object") {
    throw new ErroAplicacao("A Cora não devolveu o token.", 502, "cora_auth");
  }
  const registro = json as Record<string, unknown>;
  const accessToken = texto(registro.access_token, 8000);
  if (!accessToken) throw new ErroAplicacao("A Cora não devolveu o token.", 502, "cora_auth");
  const refresh = texto(registro.refresh_token, 8000);
  const expires = typeof registro.expires_in === "number" && registro.expires_in > 0 ? registro.expires_in : 86_400;
  return {
    accessToken,
    refreshToken: refresh,
    expiraEm: Date.now() + expires * 1000,
  };
}

async function postToken(transporte: TransporteCora, campos: Record<string, string>): Promise<TokensCora> {
  const { clientId, clientSecret } = credenciaisParceiroCora();
  const resposta = await transporte({
    url: `${baseCora()}/oauth/token`,
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: autorizacaoBasica(clientId, clientSecret),
    },
    body: new URLSearchParams(campos).toString(),
  });
  if (resposta.status < 200 || resposta.status >= 300) {
    const codigo = resposta.status === 400 || resposta.status === 401 ? "cora_auth" : "cora_recusou";
    const status = resposta.status >= 500 ? 502 : 422;
    throw new ErroAplicacao(mensagemCora(resposta.status, resposta.body), status, codigo);
  }
  return lerTokensCora(resposta.body);
}

export function trocarCodigoCora(transporte: TransporteCora, code: string): Promise<TokensCora> {
  if (!/^[A-Za-z0-9._-]{8,512}$/.test(code)) {
    throw new ErroAplicacao("A Cora não devolveu um código de autorização válido.", 400, "cora_oauth");
  }
  return postToken(transporte, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectCora(),
  });
}

export function renovarTokenCora(transporte: TransporteCora, refreshToken: string): Promise<TokensCora> {
  return postToken(transporte, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export function tokenParceiroCora(transporte: TransporteCora): Promise<TokensCora> {
  return postToken(transporte, { grant_type: "client_credentials" });
}

function centavosDe(valor: string): number {
  const normal = normalizarDinheiro(valor);
  if (!normal) throw new ErroAplicacao("Informe o valor da cobrança.", 400, "valor_invalido");
  const [inteiro, frac] = normal.split(".");
  const centavos = Number(inteiro) * 100 + Number(frac);
  if (!Number.isInteger(centavos) || centavos < 500) {
    throw new ErroAplicacao("A Cora aceita boleto a partir de R$ 5,00.", 400, "valor_invalido");
  }
  if (centavos > 99_999_999_99) {
    throw new ErroAplicacao("O valor passa do limite aceito pela Cora.", 400, "valor_invalido");
  }
  return centavos;
}

function percentual(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0 || numero > 100) return null;
  return Math.round(numero * 100) / 100;
}

export function corpoFaturaCora(dados: NovaFaturaCora): Record<string, unknown> {
  if (!UUID.test(dados.idempotencyKey)) {
    throw new ErroAplicacao("A chave de idempotência da Cora precisa ser um UUID.", 500, "cora_idempotencia");
  }
  const documento = dados.pagador.cpfCnpj.replace(/\D/g, "");
  const descricao = (dados.descricao?.trim() || "Cobrança").slice(0, 100);
  const email = dados.pagador.email?.trim().slice(0, 60);
  const termos: Record<string, unknown> = { due_date: dados.vencimento };
  const multa = percentual(dados.encargos?.multaPercentual);
  const juros = percentual(dados.encargos?.jurosPercentual);
  const desconto = percentual(dados.encargos?.descontoPercentual);
  if (multa !== null) termos.fine = { rate: multa };
  if (juros !== null) termos.interest = { rate: juros };
  if (desconto !== null) termos.discount = { type: "PERCENT", value: desconto };
  return {
    code: dados.codigo.slice(0, 64),
    customer: {
      name: dados.pagador.nome.trim().slice(0, 60),
      ...(email && email.includes("@") ? { email } : {}),
      document: { identity: documento, type: documento.length > 11 ? "CNPJ" : "CPF" },
      address: {
        street: dados.pagador.endereco.slice(0, 120),
        number: (dados.pagador.numero || "S/N").slice(0, 20),
        district: dados.pagador.bairro.slice(0, 80),
        city: dados.pagador.cidade.slice(0, 80),
        state: dados.pagador.uf.slice(0, 2).toUpperCase(),
        complement: (dados.pagador.complemento?.trim() || "N/A").slice(0, 80),
        zip_code: dados.pagador.cep.replace(/\D/g, "").slice(0, 8),
      },
    },
    services: [{ name: descricao.slice(0, 60) || "Cobrança", description: descricao, amount: centavosDe(dados.valor) }],
    payment_terms: termos,
    payment_forms: ["BANK_SLIP", "PIX"],
  };
}

function reaisDeCentavos(valor: unknown): string {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return "0.00";
  const centavos = Math.round(valor);
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

function dataIso(valor: unknown): string | null {
  const textoData = texto(valor, 40);
  if (!textoData) return null;
  const data = /^(\d{4}-\d{2}-\d{2})/.exec(textoData);
  return data ? data[1] : null;
}

function urlHttps(valor: unknown): string | null {
  const candidato = texto(valor, 2000);
  if (!candidato || !candidato.startsWith("https://")) return null;
  return candidato;
}

export function lerFaturaCora(bruto: unknown): FaturaCora {
  if (!bruto || typeof bruto !== "object") {
    throw new ErroAplicacao("A Cora respondeu sem a fatura.", 502, "cora_resposta");
  }
  const corpo = bruto as Record<string, unknown>;
  const id = texto(corpo.id, 80);
  if (!id) throw new ErroAplicacao("A Cora respondeu sem o identificador da fatura.", 502, "cora_resposta");
  const termos = (corpo.payment_terms && typeof corpo.payment_terms === "object" ? corpo.payment_terms : {}) as Record<
    string,
    unknown
  >;
  const opcoes = (corpo.payment_options && typeof corpo.payment_options === "object" ? corpo.payment_options : {}) as Record<
    string,
    unknown
  >;
  const boleto = (opcoes.bank_slip && typeof opcoes.bank_slip === "object" ? opcoes.bank_slip : {}) as Record<string, unknown>;
  const pix = (corpo.pix && typeof corpo.pix === "object" ? corpo.pix : {}) as Record<string, unknown>;
  const servicos = Array.isArray(corpo.services) ? corpo.services : [];
  const primeiro = servicos[0] && typeof servicos[0] === "object" ? (servicos[0] as Record<string, unknown>) : {};
  const pagamentos = Array.isArray(corpo.payments) ? corpo.payments : [];
  const pagamento = pagamentos[0] && typeof pagamentos[0] === "object" ? (pagamentos[0] as Record<string, unknown>) : {};
  const metodoBruto = texto(pagamento.method, 20)?.toUpperCase() ?? null;
  const metodo = metodoBruto === "PIX" || metodoBruto === "BANK_SLIP" ? metodoBruto : null;
  return {
    id,
    status: (texto(corpo.status, 40) ?? "DRAFT").toUpperCase(),
    valor: reaisDeCentavos(corpo.total_amount),
    valorPago: reaisDeCentavos(corpo.total_paid),
    vencimento: dataIso(termos.due_date) ?? "",
    pagoEm: dataIso(corpo.occurrence_date) ?? dataIso(pagamento.finalized_at),
    codigo: texto(corpo.code, 80),
    linhaDigitavel: texto(boleto.digitable, 80),
    codigoBarras: texto(boleto.barcode, 80),
    boletoUrl: urlHttps(boleto.url),
    pixCopiaCola: texto(pix.emv, 2000),
    descricao: texto(primeiro.description, 200) ?? texto(primeiro.name, 100),
    metodo,
  };
}

function idFatura(id: string): string {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) {
    throw new ErroAplicacao("Identificador da fatura na Cora inválido.", 400, "cora_id");
  }
  return id;
}

function exigirOk(resposta: RespostaCoraHttp, aceitarVazio = false): unknown {
  if (resposta.status === 401) {
    throw new ErroAplicacao("A Cora não aceitou o acesso desta conta.", 401, "cora_auth");
  }
  if (resposta.status === 404) {
    throw new ErroAplicacao("Fatura não encontrada na Cora.", 404, "cora_recusou");
  }
  if (resposta.status === 429) {
    throw new ErroAplicacao("A Cora limitou as chamadas. Tente de novo daqui a pouco.", 429, "cora_limite");
  }
  if (resposta.status < 200 || resposta.status >= 300) {
    const status = resposta.status >= 500 ? 502 : 422;
    throw new ErroAplicacao(mensagemCora(resposta.status, resposta.body), status, "cora_recusou");
  }
  if (aceitarVazio && !resposta.body.trim()) return null;
  return lerJson(resposta.body);
}

export function criarClienteHttpCora(
  tokenDe: (forcar?: boolean) => Promise<string>,
  transporte: TransporteCora,
): {
  testarConexao(): Promise<{ titular: string }>;
  criarFatura(dados: NovaFaturaCora): Promise<FaturaCora>;
  consultarFatura(id: string): Promise<FaturaCora>;
  cancelarFatura(id: string): Promise<void>;
} {
  async function chamar(pedido: Omit<PedidoCora, "headers"> & { headers?: Record<string, string> }, renovar = true) {
    const token = await tokenDe(!renovar);
    const resposta = await transporte({
      ...pedido,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...pedido.headers },
    });
    if (resposta.status === 401 && renovar) {
      return chamar(pedido, false);
    }
    return resposta;
  }

  return {
    async testarConexao() {
      const resposta = await chamar({ url: `${baseCora()}/v2/invoices?page=1&perPage=1`, method: "GET" });
      exigirOk(resposta, true);
      return { titular: "Conta Cora conectada" };
    },
    async criarFatura(dados) {
      const resposta = await chamar({
        url: `${baseCora()}/v2/invoices`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": dados.idempotencyKey,
        },
        body: JSON.stringify(corpoFaturaCora(dados)),
      });
      return lerFaturaCora(exigirOk(resposta));
    },
    async consultarFatura(id) {
      const resposta = await chamar({ url: `${baseCora()}/v2/invoices/${idFatura(id)}`, method: "GET" });
      return lerFaturaCora(exigirOk(resposta));
    },
    async cancelarFatura(id) {
      const resposta = await chamar({ url: `${baseCora()}/v2/invoices/${idFatura(id)}`, method: "DELETE" });
      exigirOk(resposta, true);
    },
  };
}

function uuidDe(texto: string): string {
  const hash = createHash("sha256").update(texto).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function registrarWebhooksCora(transporte: TransporteCora, token: string, url: string): Promise<void> {
  if (!url.startsWith("https://")) {
    throw new ErroAplicacao("O webhook da Cora precisa de HTTPS.", 500, "cora_webhook");
  }
  for (const trigger of GATILHOS_WEBHOOK_CORA) {
    const resposta = await transporte({
      url: `${baseCora()}/endpoints/`,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
        "idempotency-key": uuidDe(`cora-endpoint:${baseCora()}:${url}:${trigger}`),
      },
      body: JSON.stringify({ url, resource: "invoice", trigger }),
    });
    if (resposta.status === 401) {
      throw new ErroAplicacao("A Cora não aceitou o cadastro do webhook.", 502, "cora_webhook");
    }
    if (resposta.status < 200 || resposta.status >= 300) {
      throw new ErroAplicacao(mensagemCora(resposta.status, resposta.body), resposta.status >= 500 ? 502 : 422, "cora_webhook");
    }
  }
}
