import { descreverCobranca, formaCobrancaDe } from "@/lib/cobranca";
import { dataHojeIso, dataIsoValida, proximoVencimentoIso } from "@/lib/data";
import type { ClienteServicoDTO, PreferenciasCobrancaDTO, PreviaRecorrencia, ResultadoLoteRecorrencia } from "@/lib/tipos";
import {
  esquemaAtivarRecorrencia,
  esquemaEditarRecorrencia,
  esquemaLoteRecorrencia,
  esquemaRetomarRecorrencia,
} from "@/lib/validacao";
import { abrirClienteAsaas, asaasRespondeu, traduzirErroAsaas } from "@/server/asaas/abrir";
import type { ClienteHttpAsaas, EncargosAsaas } from "@/server/asaas/contrato";
import { logAsaas, logAsaasErro, mensagemLogAsaas } from "@/server/asaas/log";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { paraClienteServico } from "./mapeadores";
import { escolherPercentual, obterPreferenciasCobranca } from "./preferencia-cobranca-service";
import {
  atualizarFaturasAbertasDaAssinatura,
  garantirClienteAsaas,
  gravarCobrancasEspelhadas,
  marcarFaturasAbertasExcluidas,
} from "./fatura-service";

const PODE_SUBSTITUIR = new Set(["CANCELADA", "EXPIRED"]);

function camposDoCartao(forma: string, statusAtual: string | null) {
  if (forma !== "CREDIT_CARD") {
    return { cartaoStatus: null, cartaoBandeira: null, cartaoFinal: null };
  }
  if (statusAtual) return {};
  return { cartaoStatus: "AGUARDANDO" };
}
const LIMITE_PAGINA = 100;

function encargosInformados(
  dados: {
    multaPercentual?: string | null;
    jurosPercentual?: string | null;
    descontoPercentual?: string | null;
    descontoDiasAntes?: number | null;
  },
  prefs: PreferenciasCobrancaDTO,
): EncargosAsaas {
  const desconto = escolherPercentual(dados.descontoPercentual, prefs.descontoPercentual);
  const dias = desconto
    ? dados.descontoDiasAntes === undefined
      ? (prefs.descontoDiasAntes ?? 0)
      : (dados.descontoDiasAntes ?? 0)
    : null;
  return {
    multaPercentual: escolherPercentual(dados.multaPercentual, prefs.multaPercentual),
    jurosPercentual: escolherPercentual(dados.jurosPercentual, prefs.jurosPercentual),
    descontoPercentual: desconto,
    descontoDiasAntes: dias,
  };
}

function textoDaCobranca(
  modelo: string,
  vinculo: { servico: { nome: string }; cliente: { nomeFantasia: string } },
  vencimento: string,
) {
  return descreverCobranca(modelo, {
    servico: vinculo.servico.nome,
    cliente: vinculo.cliente.nomeFantasia,
    vencimento,
  }).slice(0, 500);
}

function resolverVencimento(dia: number, informado: string | undefined, hoje: string) {
  const calculado = proximoVencimentoIso(dia, hoje);
  if (!calculado) {
    throw new ErroAplicacao("Informe o dia de vencimento entre 1 e 31.", 400, "dia_invalido");
  }
  const vencimento = informado ?? calculado;
  if (!dataIsoValida(vencimento) || vencimento < hoje) {
    throw new ErroAplicacao("O primeiro vencimento não pode ser no passado.", 400, "vencimento_passado");
  }
  const ultimo = new Date(Date.UTC(Number(vencimento.slice(0, 4)), Number(vencimento.slice(5, 7)), 0)).getUTCDate();
  if (Number(vencimento.slice(8, 10)) !== Math.min(dia, ultimo)) {
    throw new ErroAplicacao("O primeiro vencimento precisa cair no dia escolhido.", 400, "vencimento_dia");
  }
  return vencimento;
}

async function buscarVinculo(empresaId: string, id: string) {
  const vinculo = await prisma.clienteServico.findFirst({
    where: { id, empresaId },
    include: {
      servico: { select: { nome: true, aliquotaImposto: true } },
      cliente: true,
    },
  });
  if (!vinculo) throw new ErroAplicacao("Serviço do cliente não encontrado.", 404, "nao_encontrado");
  return vinculo;
}

function exigirMensalAtivo(vinculo: { recorrencia: string; status: string }) {
  if (vinculo.recorrencia !== "MENSAL" || vinculo.status !== "ATIVO") {
    throw new ErroAplicacao("Só uma venda mensal ativa entra na cobrança recorrente.", 409, "recorrencia_indisponivel");
  }
}

function podeCriar(vinculo: { asaasSubscriptionId: string | null; asaasAssinaturaStatus: string | null }) {
  if (!vinculo.asaasSubscriptionId) return true;
  return vinculo.asaasAssinaturaStatus !== null && PODE_SUBSTITUIR.has(vinculo.asaasAssinaturaStatus);
}

async function sincronizarAssinatura(empresaId: string, assinaturaId: string, http: ClienteHttpAsaas) {
  const cobrancas = [];
  let offset = 0;
  for (let pagina = 0; pagina < 5; pagina += 1) {
    const lote = await http.listarCobrancasDaAssinatura(assinaturaId, offset, LIMITE_PAGINA);
    cobrancas.push(...lote.cobrancas);
    if (!lote.temMais || lote.cobrancas.length === 0) break;
    offset += lote.cobrancas.length;
  }
  await gravarCobrancasEspelhadas(empresaId, cobrancas);
}

export async function ativarRecorrencia(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: unknown,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ClienteServicoDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaAtivarRecorrencia, entrada);
  const vinculo = await buscarVinculo(autor.empresaId, clienteServicoId);
  exigirMensalAtivo(vinculo);
  if (!podeCriar(vinculo)) {
    throw new ErroAplicacao("Esta venda já tem cobrança recorrente.", 409, "assinatura_existente");
  }

  const hoje = dataHojeIso();
  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  const dia = dados.diaVencimento ?? prefs.diaVencimento;
  const vencimento = resolverVencimento(dia, dados.proximoVencimento, hoje);
  const valor = dados.valor ?? vinculo.valor.toFixed(2);
  if (valor === "0.00") throw new ErroAplicacao("Informe um valor maior que zero.", 400, "valor_invalido");
  const descricao = (
    dados.descricao?.trim() || textoDaCobranca(dados.modeloDescricao?.trim() || prefs.modeloDescricao, vinculo, vencimento)
  ).slice(0, 500);
  const forma = formaCobrancaDe(dados.formaCobranca ?? prefs.formaCobranca);

  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const customer = await garantirClienteAsaas(autor.empresaId, vinculo.cliente, http);
    const assinatura = await http.criarAssinatura({
      customer,
      formaCobranca: forma,
      valor,
      proximoVencimento: vencimento,
      descricao,
      referencia: vinculo.id,
      encargos: encargosInformados(dados, prefs),
    });
    const gravado = await prisma.clienteServico.updateMany({
      where: {
        id: vinculo.id,
        empresaId: autor.empresaId,
        OR: [{ asaasSubscriptionId: null }, { asaasAssinaturaStatus: { in: [...PODE_SUBSTITUIR] } }],
      },
      data: {
        valor: assinatura.valor,
        asaasSubscriptionId: assinatura.id,
        asaasAssinaturaStatus: assinatura.status,
        formaCobrancaRecorrente: formaCobrancaDe(assinatura.formaCobranca),
        diaVencimento: dia,
        proximoVencimento: new Date(`${assinatura.proximoVencimento}T00:00:00.000Z`),
        descricaoRecorrente: assinatura.descricao ?? descricao,
        ...camposDoCartao(formaCobrancaDe(assinatura.formaCobranca), vinculo.cartaoStatus),
      },
    });
    if (gravado.count !== 1) {
      await http.cancelarAssinatura(assinatura.id).catch(() => undefined);
      throw new ErroAplicacao("Esta venda já tem cobrança recorrente.", 409, "assinatura_existente");
    }
    logAsaas("assinatura criada", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      asaasSubscriptionId: assinatura.id,
    });
    try {
      await sincronizarAssinatura(autor.empresaId, assinatura.id, http);
    } catch (erro) {
      logAsaasErro("falha ao espelhar cobrança da assinatura", {
        empresaId: autor.empresaId,
        clienteServicoId: vinculo.id,
        mensagem: mensagemLogAsaas(erro),
      });
    }
    return paraClienteServico(await buscarVinculo(autor.empresaId, vinculo.id), true, true);
  } catch (erro) {
    if (!(erro instanceof ErroAplicacao && erro.codigo === "assinatura_existente")) {
      logAsaasErro("falha ao criar assinatura", {
        empresaId: autor.empresaId,
        clienteServicoId: vinculo.id,
        mensagem: mensagemLogAsaas(erro),
      });
    }
    traduzirErroAsaas(erro);
  }
}

export async function editarRecorrencia(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: unknown,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ClienteServicoDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaEditarRecorrencia, entrada);
  const vinculo = await buscarVinculo(autor.empresaId, clienteServicoId);
  if (!vinculo.asaasSubscriptionId || (vinculo.asaasAssinaturaStatus !== "ACTIVE" && vinculo.asaasAssinaturaStatus !== "INACTIVE")) {
    throw new ErroAplicacao("Esta venda não tem cobrança recorrente para editar.", 409, "assinatura_ausente");
  }
  const hoje = dataHojeIso();
  const prefs = await obterPreferenciasCobranca(autor.empresaId);
  const vencimento = resolverVencimento(dados.diaVencimento, dados.proximoVencimento, hoje);
  const descricao = (
    dados.descricao?.trim() ||
    vinculo.descricaoRecorrente ||
    textoDaCobranca(prefs.modeloDescricao, vinculo, vencimento)
  ).slice(0, 500);
  const forma = formaCobrancaDe(dados.formaCobranca ?? vinculo.formaCobrancaRecorrente ?? prefs.formaCobranca);
  const atualizarPendentes = dados.atualizarPendentes ?? prefs.atualizarPendentes;

  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const assinatura = await http.atualizarAssinatura(vinculo.asaasSubscriptionId, {
      formaCobranca: forma,
      valor: dados.valor,
      proximoVencimento: vencimento,
      descricao,
      atualizarPendentes,
      encargos: encargosInformados(dados, prefs),
    });
    await prisma.clienteServico.updateMany({
      where: { id: vinculo.id, empresaId: autor.empresaId },
      data: {
        valor: assinatura.valor,
        asaasAssinaturaStatus: assinatura.status,
        formaCobrancaRecorrente: formaCobrancaDe(assinatura.formaCobranca),
        diaVencimento: dados.diaVencimento,
        proximoVencimento: new Date(`${assinatura.proximoVencimento}T00:00:00.000Z`),
        descricaoRecorrente: assinatura.descricao ?? descricao,
        ...camposDoCartao(formaCobrancaDe(assinatura.formaCobranca), vinculo.cartaoStatus),
      },
    });
    if (atualizarPendentes) {
      await atualizarFaturasAbertasDaAssinatura(autor.empresaId, vinculo.id, {
        valor: assinatura.valor,
        formaCobranca: formaCobrancaDe(assinatura.formaCobranca),
        descricao: assinatura.descricao ?? descricao,
      });
    }
    logAsaas("assinatura atualizada", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      asaasSubscriptionId: vinculo.asaasSubscriptionId,
    });
    return paraClienteServico(await buscarVinculo(autor.empresaId, vinculo.id), true, true);
  } catch (erro) {
    logAsaasErro("falha ao atualizar assinatura", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

export async function pausarRecorrencia(
  autor: AutorEmpresa,
  clienteServicoId: string,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ClienteServicoDTO> {
  exigirCobranca(autor);
  const vinculo = await buscarVinculo(autor.empresaId, clienteServicoId);
  if (!vinculo.asaasSubscriptionId || vinculo.asaasAssinaturaStatus !== "ACTIVE") {
    throw new ErroAplicacao("Só uma recorrência ativa pode ser pausada.", 409, "assinatura_ausente");
  }
  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const assinatura = await http.atualizarAssinatura(vinculo.asaasSubscriptionId, { status: "INACTIVE" });
    await prisma.clienteServico.updateMany({
      where: { id: vinculo.id, empresaId: autor.empresaId },
      data: { asaasAssinaturaStatus: assinatura.status },
    });
    logAsaas("assinatura pausada", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      asaasSubscriptionId: vinculo.asaasSubscriptionId,
    });
    return paraClienteServico(await buscarVinculo(autor.empresaId, vinculo.id), true, true);
  } catch (erro) {
    logAsaasErro("falha ao pausar assinatura", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

export async function retomarRecorrencia(
  autor: AutorEmpresa,
  clienteServicoId: string,
  entrada: unknown,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ClienteServicoDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaRetomarRecorrencia, entrada);
  const vinculo = await buscarVinculo(autor.empresaId, clienteServicoId);
  if (!vinculo.asaasSubscriptionId || vinculo.asaasAssinaturaStatus !== "INACTIVE") {
    throw new ErroAplicacao("Só uma recorrência pausada pode ser retomada.", 409, "assinatura_ausente");
  }
  const dia = dados.diaVencimento ?? vinculo.diaVencimento;
  if (!dia) throw new ErroAplicacao("Informe o dia de vencimento entre 1 e 31.", 400, "dia_invalido");
  const vencimento = resolverVencimento(dia, dados.proximoVencimento, dataHojeIso());
  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const assinatura = await http.atualizarAssinatura(vinculo.asaasSubscriptionId, {
      status: "ACTIVE",
      proximoVencimento: vencimento,
    });
    await prisma.clienteServico.updateMany({
      where: { id: vinculo.id, empresaId: autor.empresaId },
      data: {
        asaasAssinaturaStatus: assinatura.status,
        diaVencimento: dia,
        proximoVencimento: new Date(`${assinatura.proximoVencimento}T00:00:00.000Z`),
      },
    });
    logAsaas("assinatura retomada", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      asaasSubscriptionId: vinculo.asaasSubscriptionId,
    });
    return paraClienteServico(await buscarVinculo(autor.empresaId, vinculo.id), true, true);
  } catch (erro) {
    logAsaasErro("falha ao retomar assinatura", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }
}

export async function cancelarRecorrencia(
  autor: AutorEmpresa,
  clienteServicoId: string,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ClienteServicoDTO> {
  exigirCobranca(autor);
  const vinculo = await buscarVinculo(autor.empresaId, clienteServicoId);
  if (!vinculo.asaasSubscriptionId || vinculo.asaasAssinaturaStatus === "CANCELADA") {
    throw new ErroAplicacao("Esta venda não tem cobrança recorrente para cancelar.", 409, "assinatura_ausente");
  }
  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    try {
      await http.cancelarAssinatura(vinculo.asaasSubscriptionId);
    } catch (erro) {
      if (!asaasRespondeu(erro, 404)) throw erro;
    }
  } catch (erro) {
    logAsaasErro("falha ao cancelar assinatura", {
      empresaId: autor.empresaId,
      clienteServicoId: vinculo.id,
      mensagem: mensagemLogAsaas(erro),
    });
    traduzirErroAsaas(erro);
  }

  await prisma.clienteServico.updateMany({
    where: { id: vinculo.id, empresaId: autor.empresaId },
    data: { asaasAssinaturaStatus: "CANCELADA" },
  });
  await marcarFaturasAbertasExcluidas(autor.empresaId, vinculo.id);
  logAsaas("assinatura cancelada", {
    empresaId: autor.empresaId,
    clienteServicoId: vinculo.id,
    asaasSubscriptionId: vinculo.asaasSubscriptionId,
  });
  return paraClienteServico(await buscarVinculo(autor.empresaId, vinculo.id), true, true);
}

export async function listarPreviaRecorrencia(
  autor: AutorEmpresa,
  filtro: { diaVencimento: number; clienteId?: string },
): Promise<PreviaRecorrencia> {
  exigirCobranca(autor);
  const vencimento = proximoVencimentoIso(filtro.diaVencimento, dataHojeIso());
  if (!vencimento) {
    throw new ErroAplicacao("Informe o dia de vencimento entre 1 e 31.", 400, "dia_invalido");
  }
  const vinculos = await prisma.clienteServico.findMany({
    where: {
      empresaId: autor.empresaId,
      recorrencia: "MENSAL",
      status: "ATIVO",
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      OR: [{ asaasSubscriptionId: null }, { asaasAssinaturaStatus: { in: [...PODE_SUBSTITUIR] } }],
    },
    include: {
      cliente: { select: { nomeFantasia: true } },
      servico: { select: { nome: true } },
    },
    orderBy: [{ cliente: { nomeFantasia: "asc" } }, { servico: { nome: "asc" } }],
    take: 100,
  });
  return {
    diaVencimento: filtro.diaVencimento,
    vencimento,
    itens: vinculos.map((vinculo) => ({
      id: vinculo.id,
      clienteId: vinculo.clienteId,
      nomeCliente: vinculo.cliente.nomeFantasia,
      nomeServico: vinculo.servico.nome,
      valor: vinculo.valor.toFixed(2),
    })),
  };
}

export async function ativarRecorrenciaEmLote(
  autor: AutorEmpresa,
  entrada: unknown,
  clienteHttp?: ClienteHttpAsaas,
): Promise<ResultadoLoteRecorrencia> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaLoteRecorrencia, entrada);
  const previa = await listarPreviaRecorrencia(autor, {
    diaVencimento: dados.diaVencimento,
    clienteId: dados.clienteId,
  });
  const permitidos = new Map(previa.itens.map((item) => [item.id, item]));
  const pedidos = dados.todos ? [...permitidos.keys()] : (dados.ids ?? []);
  const falhas: { id: string; erro: string }[] = [];
  let criadas = 0;
  for (const id of pedidos) {
    const item = permitidos.get(id);
    if (!item) {
      falhas.push({ id, erro: "Serviço não encontrado ou já tem recorrência." });
      continue;
    }
    try {
      await ativarRecorrencia(
        autor,
        id,
        {
          formaCobranca: dados.formaCobranca,
          diaVencimento: dados.diaVencimento,
          proximoVencimento: previa.vencimento,
          modeloDescricao: dados.modeloDescricao,
          multaPercentual: dados.multaPercentual,
          jurosPercentual: dados.jurosPercentual,
          descontoPercentual: dados.descontoPercentual,
          descontoDiasAntes: dados.descontoDiasAntes,
        },
        clienteHttp,
      );
      criadas += 1;
    } catch (erro) {
      falhas.push({
        id,
        erro: erro instanceof ErroAplicacao ? erro.message : "Não foi possível criar a assinatura.",
      });
    }
  }
  return { vencimento: previa.vencimento, criadas, falhas };
}
