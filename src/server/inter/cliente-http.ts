import { createHash } from "node:crypto";
import { ErroAplicacao } from "@/server/erros";
import type {
  CobrancaInter,
  ClienteHttpInter,
  CredenciaisInter,
  FiltroCobrancasInter,
  NovaCobrancaInter,
  PaginaCobrancasInter,
} from "./contrato";
import { DIAS_AGENDA_INTER, ESCOPO_COBRANCA_INTER } from "./contrato";
import { requisicaoMtls, type PedidoHttp, type RespostaHttp } from "./mtls";
import { urlCobrancasInter, urlTokenInter } from "./urls";

type Transporte = (pedido: PedidoHttp) => Promise<RespostaHttp>;

type TokenGuardado = { token: string; expiraEm: number };

const cacheToken = new Map<string, TokenGuardado>();

function chaveCache(credenciais: CredenciaisInter): string {
  return createHash("sha256")
    .update(
      [
        credenciais.ambiente,
        credenciais.clientId,
        credenciais.contaCorrente ?? "",
        credenciais.clientSecret,
        credenciais.certificadoPem,
      ].join("\n"),
    )
    .digest("hex");
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor).slice(0, limite);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function dinheiro(valor: unknown): string {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor.toFixed(2);
  if (typeof valor === "string" && valor.trim()) {
    const numero = Number(valor.trim().replace(",", "."));
    if (Number.isFinite(numero)) return numero.toFixed(2);
  }
  return "0.00";
}

function mensagemInter(status: number, corpo: string): string {
  let detalhe = "";
  try {
    const json = JSON.parse(corpo) as { title?: unknown; detail?: unknown; message?: unknown; violacoes?: unknown };
    const titulo = texto(json.title, 120) ?? texto(json.message, 120) ?? "";
    const extra = texto(json.detail, 180) ?? "";
    detalhe = [titulo, extra].filter(Boolean).join(" ");
  } catch {
    detalhe = "";
  }
  if (!detalhe) return `O Banco Inter recusou a chamada (${status}).`;
  return `O Banco Inter recusou a chamada (${status}). ${detalhe}`.slice(0, 320);
}

function lerJson(corpo: string): unknown {
  if (!corpo.trim()) return null;
  try {
    return JSON.parse(corpo) as unknown;
  } catch {
    throw new ErroAplicacao("O Banco Inter respondeu em um formato inesperado.", 502, "inter_resposta");
  }
}

function deCobranca(bruto: unknown, descricao: string | null): CobrancaInter {
  if (!bruto || typeof bruto !== "object") {
    throw new ErroAplicacao("O Banco Inter respondeu sem a cobrança.", 502, "inter_resposta");
  }
  const corpo = bruto as { cobranca?: unknown; boleto?: unknown; pix?: unknown };
  const cobranca = (corpo.cobranca && typeof corpo.cobranca === "object" ? corpo.cobranca : corpo) as Record<
    string,
    unknown
  >;
  const boleto = (corpo.boleto && typeof corpo.boleto === "object" ? corpo.boleto : {}) as Record<string, unknown>;
  const pix = (corpo.pix && typeof corpo.pix === "object" ? corpo.pix : {}) as Record<string, unknown>;
  const codigo = texto(cobranca.codigoSolicitacao, 80);
  if (!codigo) throw new ErroAplicacao("O Banco Inter respondeu sem o código da cobrança.", 502, "inter_resposta");
  const origem = texto(cobranca.origemRecebimento, 16);
  return {
    codigoSolicitacao: codigo,
    seuNumero: texto(cobranca.seuNumero, 15) ?? "",
    situacao: (texto(cobranca.situacao, 40) ?? "EM_PROCESSAMENTO").toUpperCase(),
    dataVencimento: texto(cobranca.dataVencimento, 10) ?? "",
    dataSituacao: texto(cobranca.dataSituacao, 40),
    valorNominal: dinheiro(cobranca.valorNominal),
    valorTotalRecebido: cobranca.valorTotalRecebido == null ? null : dinheiro(cobranca.valorTotalRecebido),
    origemRecebimento: origem === "PIX" || origem === "BOLETO" ? origem : null,
    linhaDigitavel: texto(boleto.linhaDigitavel, 80),
    codigoBarras: texto(boleto.codigoBarras, 80),
    pixCopiaCola: texto(pix.pixCopiaECola, 2000),
    descricao,
  };
}

function valorNumero(valor: string): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 2.5 || numero > 99_999_999.99) {
    throw new ErroAplicacao("O Inter aceita cobrança entre R$ 2,50 e R$ 99.999.999,99.", 400, "valor_invalido");
  }
  return Math.round(numero * 100) / 100;
}

function percentual(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero;
}

function corpoEmissao(dados: NovaCobrancaInter): Record<string, unknown> {
  const pagador = dados.pagador;
  const multa = percentual(dados.encargos?.multaPercentual);
  const mora = percentual(dados.encargos?.jurosPercentual);
  const desconto = percentual(dados.encargos?.descontoPercentual);
  const mensagem = dados.descricao?.trim().slice(0, 78);
  return {
    seuNumero: dados.seuNumero,
    valorNominal: valorNumero(dados.valorNominal),
    dataVencimento: dados.dataVencimento,
    numDiasAgenda: DIAS_AGENDA_INTER,
    pagador: {
      cpfCnpj: pagador.cpfCnpj,
      tipoPessoa: pagador.tipoPessoa,
      nome: pagador.nome.slice(0, 100),
      endereco: pagador.endereco.slice(0, 100),
      numero: (pagador.numero || "S/N").slice(0, 10),
      ...(pagador.complemento ? { complemento: pagador.complemento.slice(0, 30) } : {}),
      bairro: pagador.bairro.slice(0, 60),
      cidade: pagador.cidade.slice(0, 60),
      uf: pagador.uf.slice(0, 2).toUpperCase(),
      cep: pagador.cep,
      ...(pagador.email ? { email: pagador.email.slice(0, 80) } : {}),
      ...(pagador.ddd ? { ddd: pagador.ddd } : {}),
      ...(pagador.telefone ? { telefone: pagador.telefone } : {}),
    },
    formasRecebimento: ["BOLETO", "PIX"],
    ...(mensagem ? { mensagem: { linha1: mensagem } } : {}),
    ...(multa ? { multa: { codigo: "PERCENTUAL", taxa: multa } } : {}),
    ...(mora ? { mora: { codigo: "TAXAMENSAL", taxa: mora } } : {}),
    ...(desconto
      ? {
          desconto: {
            codigo: "PERCENTUALDATAINFORMADA",
            taxa: desconto,
            quantidadeDias: dados.encargos?.descontoDiasAntes ?? 0,
          },
        }
      : {}),
  };
}

export function criarClienteHttpInter(
  credenciais: CredenciaisInter,
  transporte: Transporte = requisicaoMtls,
  agora: () => number = () => Date.now(),
): ClienteHttpInter {
  const base = urlCobrancasInter(credenciais.ambiente);
  const chave = chaveCache(credenciais);

  function cabecalhos(token: string, json = true): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (json) headers["Content-Type"] = "application/json";
    if (credenciais.contaCorrente) headers["x-conta-corrente"] = credenciais.contaCorrente;
    return headers;
  }

  async function pedir(caminho: string, method: string, token: string, body?: string): Promise<RespostaHttp> {
    return transporte({
      url: caminho.startsWith("http") ? caminho : `${base}${caminho}`,
      method,
      headers: cabecalhos(token, body !== undefined),
      body,
      cert: credenciais.certificadoPem,
      key: credenciais.chavePrivadaPem,
    });
  }

  async function token(): Promise<string> {
    const guardado = cacheToken.get(chave);
    if (guardado && guardado.expiraEm - 60_000 > agora()) return guardado.token;
    const corpo = new URLSearchParams({
      client_id: credenciais.clientId,
      client_secret: credenciais.clientSecret,
      grant_type: "client_credentials",
      scope: ESCOPO_COBRANCA_INTER,
    }).toString();
    let resposta: RespostaHttp;
    try {
      resposta = await transporte({
        url: urlTokenInter(credenciais.ambiente),
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: corpo,
        cert: credenciais.certificadoPem,
        key: credenciais.chavePrivadaPem,
      });
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      throw new ErroAplicacao("Não foi possível autenticar no Banco Inter.", 502, "inter_auth");
    }
    if (resposta.status < 200 || resposta.status >= 300) {
      throw new ErroAplicacao("Não foi possível autenticar no Banco Inter. Confira certificado, client id e segredo.", 422, "inter_auth");
    }
    const json = lerJson(resposta.body) as { access_token?: unknown; expires_in?: unknown } | null;
    const acesso = texto(json?.access_token, 4000);
    if (!acesso) throw new ErroAplicacao("O Banco Inter não devolveu o token.", 502, "inter_auth");
    const segundos = typeof json?.expires_in === "number" && json.expires_in > 30 ? json.expires_in : 3600;
    cacheToken.set(chave, { token: acesso, expiraEm: agora() + Math.min(segundos, 3600) * 1000 });
    return acesso;
  }

  async function exigir(resposta: RespostaHttp, aceitos: number[]): Promise<unknown> {
    if (!aceitos.includes(resposta.status)) {
      throw new ErroAplicacao(mensagemInter(resposta.status, resposta.body), resposta.status === 404 ? 404 : resposta.status >= 500 ? 502 : 422, "inter_recusou");
    }
    return lerJson(resposta.body);
  }

  async function obter(codigo: string, descricao: string | null, acesso: string): Promise<CobrancaInter> {
    const resposta = await pedir(`/${encodeURIComponent(codigo)}`, "GET", acesso);
    const json = await exigir(resposta, [200]);
    return deCobranca(json, descricao);
  }

  return {
    async testarConexao() {
      const acesso = await token();
      const hoje = new Date(agora()).toISOString().slice(0, 10);
      const consulta = new URLSearchParams({
        dataInicial: hoje,
        dataFinal: hoje,
        "paginacao.paginaAtual": "0",
        "paginacao.itensPorPagina": "1",
      });
      const resposta = await pedir(`?${consulta.toString()}`, "GET", acesso);
      if (resposta.status === 403) {
        throw new ErroAplicacao(
          "O token foi aceito, mas a aplicação do Inter não tem o escopo boleto-cobranca.read.",
          422,
          "inter_escopo",
        );
      }
      await exigir(resposta, [200]);
      const conta = credenciais.contaCorrente;
      return { titular: conta ? `Inter · conta ${conta}` : "Inter" };
    },

    async buscarPorSeuNumero(seuNumero, vencimento) {
      const acesso = await token();
      const consulta = new URLSearchParams({
        dataInicial: vencimento,
        dataFinal: vencimento,
        filtrarDataPor: "VENCIMENTO",
        seuNumero,
        "paginacao.paginaAtual": "0",
        "paginacao.itensPorPagina": "10",
      });
      const resposta = await pedir(`?${consulta.toString()}`, "GET", acesso);
      const json = (await exigir(resposta, [200])) as { cobrancas?: unknown } | null;
      const lista = Array.isArray(json?.cobrancas) ? json.cobrancas : [];
      const achada = lista
        .map((item) => {
          try {
            return deCobranca(item, null);
          } catch {
            return null;
          }
        })
        .find((item) => item && item.seuNumero.toUpperCase() === seuNumero.toUpperCase());
      return achada ?? null;
    },

    async criarCobranca(dados) {
      const existente = await this.buscarPorSeuNumero(dados.seuNumero, dados.dataVencimento);
      if (existente) return existente;
      const acesso = await token();
      const resposta = await pedir("", "POST", acesso, JSON.stringify(corpoEmissao(dados)));
      if (resposta.status === 400 || resposta.status === 409 || resposta.status === 422) {
        const deNovo = await this.buscarPorSeuNumero(dados.seuNumero, dados.dataVencimento);
        if (deNovo) return deNovo;
      }
      const json = (await exigir(resposta, [200, 201, 202])) as { codigoSolicitacao?: unknown } | null;
      const codigo = texto(json?.codigoSolicitacao, 80);
      if (!codigo) throw new ErroAplicacao("O Banco Inter não devolveu o código da cobrança.", 502, "inter_resposta");
      try {
        return await obter(codigo, dados.descricao ?? null, acesso);
      } catch (erro) {
        if (erro instanceof ErroAplicacao && erro.status === 404) {
          return {
            codigoSolicitacao: codigo,
            seuNumero: dados.seuNumero,
            situacao: "EM_PROCESSAMENTO",
            dataVencimento: dados.dataVencimento,
            dataSituacao: null,
            valorNominal: valorNumero(dados.valorNominal).toFixed(2),
            valorTotalRecebido: null,
            origemRecebimento: null,
            linhaDigitavel: null,
            codigoBarras: null,
            pixCopiaCola: null,
            descricao: dados.descricao ?? null,
          };
        }
        throw erro;
      }
    },

    async consultarCobranca(codigoSolicitacao) {
      return obter(codigoSolicitacao, null, await token());
    },

    async cancelarCobranca(codigoSolicitacao, motivo) {
      const resposta = await pedir(
        `/${encodeURIComponent(codigoSolicitacao)}/cancelar`,
        "POST",
        await token(),
        JSON.stringify({ motivoCancelamento: motivo.slice(0, 50) || "Cancelada no Taguaro" }),
      );
      if (resposta.status === 404) return;
      await exigir(resposta, [200, 202, 204]);
    },

    async editarCobranca(codigoSolicitacao, dados) {
      const corpo: Record<string, unknown> = {};
      if (dados.vencimento) corpo.dataVencimento = dados.vencimento;
      if (dados.valor) corpo.valorNominal = valorNumero(dados.valor);
      const resposta = await pedir(`/${encodeURIComponent(codigoSolicitacao)}`, "PATCH", await token(), JSON.stringify(corpo));
      await exigir(resposta, [200, 202]);
    },

    async obterPdf(codigoSolicitacao) {
      const resposta = await pedir(`/${encodeURIComponent(codigoSolicitacao)}/pdf`, "GET", await token());
      const json = (await exigir(resposta, [200])) as { pdf?: unknown } | null;
      const pdf = texto(json?.pdf, 8_000_000);
      if (!pdf) throw new ErroAplicacao("O Banco Inter não devolveu o PDF do boleto.", 502, "inter_pdf");
      return pdf;
    },

    async listarCobrancas(filtro: FiltroCobrancasInter): Promise<PaginaCobrancasInter> {
      const consulta = new URLSearchParams({
        dataInicial: filtro.dataInicial,
        dataFinal: filtro.dataFinal,
        filtrarDataPor: "VENCIMENTO",
        "paginacao.paginaAtual": String(filtro.pagina),
        "paginacao.itensPorPagina": String(filtro.itensPorPagina),
      });
      if (filtro.seuNumero) consulta.set("seuNumero", filtro.seuNumero);
      if (filtro.situacao) consulta.set("situacao", filtro.situacao);
      const resposta = await pedir(`?${consulta.toString()}`, "GET", await token());
      const json = (await exigir(resposta, [200])) as {
        cobrancas?: unknown;
        totalPaginas?: unknown;
        ultimaPagina?: unknown;
      } | null;
      const lista = Array.isArray(json?.cobrancas) ? json.cobrancas : [];
      const cobrancas = lista.flatMap((item) => {
        try {
          return [deCobranca(item, null)];
        } catch {
          return [];
        }
      });
      const pagina = filtro.pagina;
      const total = typeof json?.totalPaginas === "number" ? json.totalPaginas : pagina + 1;
      const temMais = json?.ultimaPagina === true ? false : pagina + 1 < total && cobrancas.length > 0;
      return { cobrancas, temMais };
    },

    async registrarWebhook(url) {
      if (!url.startsWith("https://")) {
        throw new ErroAplicacao("O webhook do Inter precisa de uma URL pública em HTTPS.", 422, "webhook_url");
      }
      const resposta = await pedir("/webhook", "PUT", await token(), JSON.stringify({ webhookUrl: url }));
      await exigir(resposta, [200, 204]);
    },
  };
}

export function limparCacheTokenInter() {
  cacheToken.clear();
}
