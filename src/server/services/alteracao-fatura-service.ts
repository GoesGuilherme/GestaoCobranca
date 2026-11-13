import { randomBytes, randomUUID } from "node:crypto";
import { isoDeData } from "@/lib/data";
import {
  alteracaoMudou,
  descricaoNormalizada,
  ERRO_REEMISSAO_CORA,
  faturaPodeSerAlterada,
  motivoFaturaNaoAlteravel,
  reemissaoCoraPendente,
  type CamposAlteracao,
} from "@/lib/alteracao-fatura";
import type { ResultadoAlteracaoFatura, ResultadoReenvioBoletos } from "@/lib/tipos";
import { esquemaAlteracaoFatura } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import type { ClienteHttpAsaas } from "@/server/asaas/contrato";
import { traduzirErroAsaas } from "@/server/asaas/abrir";
import { logAsaasErro, mensagemLogAsaas } from "@/server/asaas/log";
import { abrirClienteCora } from "@/server/cora/abrir";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { logCora, logCoraErro } from "@/server/cora/log";
import { pagadorCoraDoCliente } from "@/server/cora/pagador";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { abrirClienteInter } from "@/server/inter/abrir";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { logInter, logInterErro } from "@/server/inter/log";
import { criarAdaptadorCora } from "@/server/pagamentos/adaptador-cora";
import { criarAdaptadorInter } from "@/server/pagamentos/adaptador-inter";
import { clienteAsaasDaEmpresa } from "@/server/pagamentos/fabrica";
import { espelhoFaturaAsaas } from "@/server/pagamentos/gravacao";
import type { ClienteResend } from "@/server/regua/resend";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { lerEsquema } from "@/server/validar";
import { gravarCobrancaCora } from "./cora-cobranca";
import { regerarBrCodePix } from "./pix-cobranca";
import { obterFatura } from "./fatura-service";
import { gravarCobrancaInter } from "./inter-cobranca";
import { encargosDaPreferencia, obterPreferenciasCobranca } from "./preferencia-cobranca-service";
import { reenviarBoletos } from "./reenvio-boleto-service";

type AutorAlteracao = AutorEmpresa & { email: string; nomeEmpresa: string };

type OpcoesAlteracao = {
  asaas?: ClienteHttpAsaas;
  cora?: ClienteHttpCora;
  inter?: ClienteHttpInter;
  resend?: ClienteResend;
  twilio?: ClienteTwilio;
  agora?: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reenvioManual(faturaId: string, resultado: "ignorado" | "falha", motivo: string): ResultadoReenvioBoletos {
  const canais = (["EMAIL", "WHATSAPP"] as const).map((canal) => ({ canal, resultado, motivo }));
  const contagem = {
    aceitos: 0,
    ignorados: resultado === "ignorado" ? 1 : 0,
    falhas: resultado === "falha" ? 1 : 0,
    naFila: 0,
  };
  return {
    email: { ...contagem },
    whatsapp: { ...contagem },
    modoTeste: false,
    itens: [{ id: faturaId, canais }],
  };
}

function camposDe(fatura: { valor: { toFixed(casas: number): string }; vencimento: Date; descricao: string | null }): CamposAlteracao {
  return {
    valor: fatura.valor.toFixed(2),
    vencimento: isoDeData(fatura.vencimento),
    descricao: descricaoNormalizada(fatura.descricao),
  };
}

function dataDaCobranca(vencimento: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    throw new ErroAplicacao("O provedor não devolveu o vencimento da cobrança.", 502, "provedor_resposta");
  }
  return new Date(`${vencimento}T00:00:00.000Z`);
}

async function codigoAsaas(
  buscar: () => Promise<string | null>,
  anterior: string | null,
  mudouTitulo: boolean,
): Promise<string | null> {
  try {
    return await buscar();
  } catch {
    return mudouTitulo ? null : anterior;
  }
}

async function alterarAsaas(
  autor: AutorAlteracao,
  atual: {
    id: string;
    asaasPaymentId: string | null;
    formaCobranca: string;
    linhaDigitavel: string | null;
    pixCopiaCola: string | null;
  },
  atualCampos: CamposAlteracao,
  nova: CamposAlteracao,
  httpInjetado?: ClienteHttpAsaas,
) {
  if (!atual.asaasPaymentId) {
    throw new ErroAplicacao("Esta cobrança ainda não tem boleto no Asaas.", 422, "sem_boleto");
  }
  const pedido: { valor?: string; vencimento?: string; descricao?: string | null } = {};
  if (atualCampos.valor !== nova.valor) pedido.valor = nova.valor;
  if (atualCampos.vencimento !== nova.vencimento) pedido.vencimento = nova.vencimento;
  if (descricaoNormalizada(atualCampos.descricao) !== descricaoNormalizada(nova.descricao)) {
    pedido.descricao = nova.descricao;
  }
  const mudouTitulo = pedido.valor !== undefined || pedido.vencimento !== undefined;
  try {
    const http = await clienteAsaasDaEmpresa(autor.empresaId, httpInjetado);
    const cobranca = await http.atualizarCobranca(atual.asaasPaymentId, pedido);
    const forma = cobranca.formaCobranca;
    const cartao = forma === "CREDIT_CARD";
    const linhaDigitavel =
      cartao || forma === "PIX"
        ? null
        : await codigoAsaas(() => http.obterLinhaDigitavel(cobranca.id), atual.linhaDigitavel, mudouTitulo);
    const pixCopiaCola = cartao
      ? null
      : await codigoAsaas(() => http.obterPix(cobranca.id), atual.pixCopiaCola, mudouTitulo);
    try {
      const gravado = await prisma.fatura.updateMany({
        where: { id: atual.id, empresaId: autor.empresaId, provedor: "ASAAS" },
        data: {
          valor: cobranca.valor,
          vencimento: dataDaCobranca(cobranca.vencimento),
          status: cobranca.status,
          ...espelhoFaturaAsaas({ status: cobranca.status, asaasPaymentId: cobranca.id }),
          formaCobranca: cobranca.formaCobranca,
          boletoUrl: cobranca.boletoUrl,
          faturaUrl: cobranca.faturaUrl,
          linhaDigitavel,
          pixCopiaCola,
          descricao: cobranca.descricao,
          excluida: cobranca.excluida,
          erroEmissao: null,
        },
      });
      if (gravado.count !== 1) {
        throw new ErroAplicacao(
          "O Asaas atualizou o boleto, mas o Taguaro não conseguiu gravar. Tente salvar de novo.",
          502,
          "gravacao_pendente",
        );
      }
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      logAsaasErro("falha ao gravar boleto alterado", {
        empresaId: autor.empresaId,
        faturaId: atual.id,
        mensagem: mensagemLogAsaas(erro),
      });
      throw new ErroAplicacao(
        "O Asaas atualizou o boleto, mas o Taguaro não conseguiu gravar. Tente salvar de novo.",
        502,
        "gravacao_pendente",
      );
    }
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    logAsaasErro("falha ao alterar boleto", {
      empresaId: autor.empresaId,
      faturaId: atual.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

async function alterarCora(
  autor: AutorAlteracao,
  atual: {
    id: string;
    clienteId: string;
    idExterno: string | null;
    idempotencyKeyCora: string | null;
    erroEmissao: string | null;
    excluida: boolean;
  },
  nova: CamposAlteracao,
  clienteHttp?: ClienteHttpCora,
) {
  const cliente = await prisma.cliente.findFirst({ where: { id: atual.clienteId, empresaId: autor.empresaId } });
  if (!cliente) throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");
  const pagador = pagadorCoraDoCliente(cliente);
  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  const provedor = criarAdaptadorCora(await abrirClienteCora(autor.empresaId, clienteHttp));
  const pendente = reemissaoCoraPendente(atual.erroEmissao);
  let chave = atual.idempotencyKeyCora;

  if (!pendente) {
    if (!atual.idExterno) throw new ErroAplicacao("Esta cobrança ainda não tem boleto na Cora.", 422, "sem_boleto");
    try {
      await provedor.cancelarCobranca(atual.idExterno);
    } catch (erro) {
      if (!(erro instanceof ErroAplicacao && erro.status === 404)) throw erro;
    }
    chave = randomUUID();
    const marcado = await prisma.fatura.updateMany({
      where: {
        id: atual.id,
        empresaId: autor.empresaId,
        provedor: "CORA",
        idExterno: atual.idExterno,
        idempotencyKeyCora: atual.idempotencyKeyCora,
        excluida: false,
      },
      data: {
        idempotencyKeyCora: chave,
        erroEmissao: ERRO_REEMISSAO_CORA,
        linhaDigitavel: null,
        pixCopiaCola: null,
        boletoUrl: null,
        faturaUrl: null,
      },
    });
    if (marcado.count !== 1) {
      throw new ErroAplicacao(
        "Esta cobrança já está sendo alterada. Espere um instante e tente de novo.",
        409,
        "alteracao_em_andamento",
      );
    }
  } else if (!chave || !UUID.test(chave)) {
    throw new ErroAplicacao("Não foi possível retomar a emissão na Cora.", 500, "cora_idempotencia");
  }

  try {
    const cobranca = await provedor.criarCobranca({
      idClienteExterno: cliente.id,
      formaCobranca: "BOLETO_PIX",
      valor: nova.valor,
      vencimento: nova.vencimento,
      descricao: nova.descricao ?? undefined,
      chaveIdempotencia: chave,
      encargos: encargosDaPreferencia(prefs),
      pagador,
    });
    await gravarCobrancaCora(autor.empresaId, atual.id, cobranca);
    logCora("fatura alterada", { empresaId: autor.empresaId, faturaId: atual.id, idExterno: cobranca.idExterno });
  } catch (erro) {
    logCoraErro("falha ao reemitir fatura", {
      empresaId: autor.empresaId,
      faturaId: atual.id,
      codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
    });
    const detalhe = erro instanceof ErroAplicacao ? erro.message : "";
    const mensagem = detalhe && detalhe !== ERRO_REEMISSAO_CORA ? `${ERRO_REEMISSAO_CORA} ${detalhe}` : ERRO_REEMISSAO_CORA;
    const status = erro instanceof ErroAplicacao && erro.status >= 400 ? erro.status : 502;
    throw new ErroAplicacao(mensagem.slice(0, 400), status, "cora_reemissao");
  }
}

async function alterarInter(
  autor: AutorAlteracao,
  atual: { id: string; idExterno: string | null },
  atualCampos: CamposAlteracao,
  nova: CamposAlteracao,
  clienteHttp?: ClienteHttpInter,
) {
  if (!atual.idExterno) throw new ErroAplicacao("Esta cobrança ainda não tem boleto no Inter.", 422, "sem_boleto");
  const mudouValor = atualCampos.valor !== nova.valor;
  const mudouVencimento = atualCampos.vencimento !== nova.vencimento;
  if (!mudouValor && !mudouVencimento) {
    const gravado = await prisma.fatura.updateMany({
      where: { id: atual.id, empresaId: autor.empresaId, provedor: "INTER" },
      data: { descricao: nova.descricao, erroEmissao: null },
    });
    if (gravado.count !== 1) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
    return;
  }
  try {
    const provedor = criarAdaptadorInter(await abrirClienteInter(autor.empresaId, clienteHttp));
    await provedor.editarCobranca(atual.idExterno, {
      valor: mudouValor ? nova.valor : undefined,
      vencimento: mudouVencimento ? nova.vencimento : undefined,
    });
    const cobranca = await provedor.consultarCobranca(atual.idExterno);
    await gravarCobrancaInter(autor.empresaId, atual.id, { ...cobranca, descricao: nova.descricao });
    logInter("fatura alterada", { empresaId: autor.empresaId, faturaId: atual.id, idExterno: cobranca.idExterno });
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    logInterErro("falha ao alterar boleto", { empresaId: autor.empresaId, faturaId: atual.id });
    throw new ErroAplicacao("Não foi possível alterar o boleto no Inter.", 502, "inter_rede");
  }
}

async function reenviarAlteracao(
  autor: AutorAlteracao,
  faturaId: string,
  opcoes: OpcoesAlteracao,
): Promise<ResultadoReenvioBoletos> {
  try {
    return await reenviarBoletos(
      autor,
      { ids: [faturaId] },
      {
        resend: opcoes.resend,
        twilio: opcoes.twilio,
        agora: opcoes.agora,
        sufixoWhatsapp: `alt${Date.now().toString(36)}${randomBytes(2).toString("hex")}`,
        limiteFila: 10,
      },
    );
  } catch (erro) {
    if (erro instanceof ErroAplicacao && (erro.status === 401 || erro.status === 403)) throw erro;
    const motivo = erro instanceof ErroAplicacao ? erro.message : "Falha ao reenviar o boleto.";
    return reenvioManual(faturaId, "falha", motivo.slice(0, 180));
  }
}

export async function alterarFatura(
  autor: AutorAlteracao,
  faturaId: string,
  entrada: unknown,
  opcoes: OpcoesAlteracao = {},
): Promise<ResultadoAlteracaoFatura> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaAlteracaoFatura, entrada);
  const nova: CamposAlteracao = {
    valor: dados.valor,
    vencimento: dados.vencimento,
    descricao: descricaoNormalizada(dados.descricao),
  };
  const atual = await prisma.fatura.findFirst({
    where: { id: faturaId, empresaId: autor.empresaId },
  });
  if (!atual) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  if (atual.provedor !== "ASAAS" && atual.provedor !== "CORA" && atual.provedor !== "INTER" && atual.provedor !== "PIX_DIRETO") {
    throw new ErroAplicacao(motivoFaturaNaoAlteravel(atual), 422, "provedor_sem_alteracao");
  }

  const pendente = atual.provedor === "CORA" && reemissaoCoraPendente(atual.erroEmissao);
  if (!faturaPodeSerAlterada(atual) && !pendente) {
    throw new ErroAplicacao(motivoFaturaNaoAlteravel(atual), 422, "fatura_fechada");
  }
  const atualCampos = camposDe(atual);
  if (!pendente && !alteracaoMudou(atualCampos, nova)) {
    throw new ErroAplicacao("Nada foi alterado.", 400, "sem_alteracao");
  }

  let reemitido = false;
  if (atual.provedor === "ASAAS") {
    await alterarAsaas(autor, atual, atualCampos, nova, opcoes.asaas);
  } else if (atual.provedor === "CORA") {
    await alterarCora(autor, atual, nova, opcoes.cora);
    reemitido = true;
  } else if (atual.provedor === "INTER") {
    await alterarInter(autor, atual, atualCampos, nova, opcoes.inter);
  } else if (atual.provedor === "PIX_DIRETO") {
    await regerarBrCodePix(autor.empresaId, atual.id, nova);
  } else {
    throw new ErroAplicacao(motivoFaturaNaoAlteravel(atual), 422, "provedor_sem_alteracao");
  }

  const fatura = await obterFatura(autor, atual.id);
  if (!faturaPodeSerAlterada(fatura)) {
    return {
      fatura,
      reenvio: reenvioManual(fatura.id, "ignorado", "Cobrança não está mais em aberto."),
      reemitido,
    };
  }
  const reenvio = await reenviarAlteracao(autor, fatura.id, opcoes);
  return { fatura, reenvio, reemitido };
}
