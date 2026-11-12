import { fimDaJanela, dentroDaJanela } from "@/lib/assessor-escopo";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { isoDeData } from "@/lib/data";
import {
  canalDoDestino,
  canalMensagemValido,
  chaveTelefone,
  formatarTelefone,
  lerPeriodoMensagens,
  motivoLegivel,
  rotuloCanalMensagem,
  rotuloDoEnvio,
  rotuloStatusMensagem,
  statusDaMensagem,
  statusMensagemValido,
  TEXTO_FORA_DA_JANELA,
  TEXTO_OPT_OUT,
  TEXTO_SEM_ENTRADA,
  textoDoEnvio,
  type CanalMensagem,
  type StatusMensagem,
} from "@/lib/mensagens-twilio";
import { podeVerMensagens } from "@/lib/permissoes";
import { esquemaRespostaWhatsapp } from "@/lib/validacao";
import type { Acesso } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import type { ClienteTwilio, CredencialTwilio } from "@/server/twilio/contrato";
import { ErroTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao, credenciaisPaiTwilio, urlWebhookTwilio } from "@/server/twilio/fabrica";
import { remetenteDaEmpresa } from "@/server/twilio/remetente";
import {
  REMETENTE_OFICIAL_WHATSAPP,
  REMETENTE_SANDBOX_WHATSAPP,
  remetenteOficialLigado,
  sandboxWhatsappLigado,
} from "@/server/twilio/sandbox";

const LIMITE_LISTA = 400;

export type MensagemResumo = {
  id: string;
  quando: string;
  clienteId: string;
  cliente: string;
  telefone: string;
  faturaId: string;
  fatura: string;
  canal: CanalMensagem;
  canalRotulo: string;
  envio: string;
  status: StatusMensagem;
  statusRotulo: string;
  motivo: string | null;
  messageSid: string | null;
  modoTeste: boolean;
};

export type EventoMensagem = {
  quando: string;
  rotulo: string;
  detalhe: string | null;
};

export type MensagemDetalhe = MensagemResumo & {
  destino: string | null;
  tentativas: number;
  atualizadoEm: string;
  variaveis: string;
  eventos: EventoMensagem[];
};

export type ResumoConversa = {
  telefone: string;
  telefoneExibicao: string;
  nomes: string;
  clienteId: string | null;
  ultimaEm: string;
  previa: string;
  naoLidas: number;
};

export type BolhaConversa = {
  id: string;
  lado: "empresa" | "cliente";
  quando: string;
  texto: string;
  detalhe: string | null;
};

export type ConversaMensagens = {
  telefone: string;
  telefoneExibicao: string;
  clientes: { id: string; nome: string }[];
  naoLidas: number;
  janelaAberta: boolean;
  janelaAte: string | null;
  optOut: boolean;
  aviso: string | null;
  bolhas: BolhaConversa[];
};

export type FiltroMensagens = {
  periodo: string;
  de: string;
  ate: string;
  status: StatusMensagem | "";
  canal: CanalMensagem | "";
  clienteId: string;
  busca: string;
};

function exigirVer(acesso: Acesso) {
  if (!podeVerMensagens(acesso.papel)) {
    throw new ErroAplicacao("Só o dono ou o financeiro pode ver as mensagens.", 403, "sem_permissao");
  }
}

export function lerFiltroMensagens(
  params: { periodo?: string; de?: string; ate?: string; status?: string; canal?: string; cliente?: string; q?: string },
  hoje: string,
): FiltroMensagens & { inicio: Date | null; fim: Date | null } {
  const periodo = lerPeriodoMensagens(params, hoje);
  return {
    ...periodo,
    status: statusMensagemValido(params.status),
    canal: canalMensagemValido(params.canal),
    clienteId: params.cliente?.trim() ?? "",
    busca: (params.q ?? "").trim().slice(0, 80),
  };
}

function formasTelefone(telefone: string): string[] {
  return [`whatsapp:+${telefone}`, `+${telefone}`, telefone];
}

function nacionalDe(telefone: string): string {
  return telefone.startsWith("55") && telefone.length > 11 ? telefone.slice(2) : telefone;
}

type PassoEnvio = {
  naEmissao: boolean;
  dias: number | null;
  assunto: string;
  regua: { nome: string };
} | null;

function envioDe(tipo: string, rotulo: string, passo: PassoEnvio): string {
  return rotuloDoEnvio({
    tipo,
    rotulo,
    passo: passo ? { ...passo, reguaNome: passo.regua.nome } : null,
  });
}

function resumoDe(linha: {
  id: string;
  criadoEm: Date;
  status: string;
  motivo: string | null;
  destino: string | null;
  messageSid: string | null;
  tipo: string;
  rotulo: string;
  modoTeste: boolean;
  cliente: { id: string; nomeFantasia: string; whatsapp: string };
  fatura: { id: string; descricao: string | null; vencimento: Date };
  passo: PassoEnvio;
  eventos: { status: string; corpo: string | null; recebidoEm: Date }[];
}): MensagemResumo {
  const eventos = [...linha.eventos].sort((a, b) => a.recebidoEm.getTime() - b.recebidoEm.getTime());
  const status = statusDaMensagem({
    statusFila: linha.status,
    motivo: linha.motivo,
    eventos: eventos.map((evento) => evento.status),
  });
  const detalhe = [...eventos].reverse().find((evento) => evento.corpo)?.corpo ?? null;
  const telefone = chaveTelefone(linha.cliente.whatsapp) ?? "";
  const vencimento = isoDeData(linha.fatura.vencimento);
  const fatura = linha.fatura.descricao?.trim() || `Cobrança ${vencimento.split("-").reverse().join("/")}`;
  return {
    id: linha.id,
    quando: linha.criadoEm.toISOString(),
    clienteId: linha.cliente.id,
    cliente: linha.cliente.nomeFantasia,
    telefone,
    faturaId: linha.fatura.id,
    fatura,
    canal: canalDoDestino(linha.destino),
    canalRotulo: rotuloCanalMensagem(canalDoDestino(linha.destino)),
    envio: envioDe(linha.tipo, linha.rotulo, linha.passo),
    status,
    statusRotulo: rotuloStatusMensagem(status),
    motivo: motivoLegivel(linha.motivo, detalhe),
    messageSid: linha.messageSid,
    modoTeste: linha.modoTeste,
  };
}

const includeLista = {
  cliente: { select: { id: true, nomeFantasia: true, whatsapp: true } },
  fatura: { select: { id: true, descricao: true, vencimento: true } },
  passo: { select: { naEmissao: true, dias: true, assunto: true, regua: { select: { nome: true } } } },
  eventos: {
    where: { tipo: "STATUS" },
    select: { status: true, corpo: true, recebidoEm: true },
    orderBy: { recebidoEm: "asc" as const },
  },
};

export async function listarMensagens(acesso: Acesso, filtro: FiltroMensagens & { inicio: Date | null; fim: Date | null }) {
  exigirVer(acesso);
  const busca = filtro.busca;
  const e: Record<string, unknown>[] = [];
  if (filtro.canal === "SMS") {
    e.push({ destino: { not: null } }, { NOT: { destino: { startsWith: "whatsapp:", mode: "insensitive" } } });
  }
  if (filtro.canal === "WHATSAPP") {
    e.push({ OR: [{ destino: null }, { destino: { startsWith: "whatsapp:", mode: "insensitive" } }] });
  }
  if (busca) {
    e.push({
      OR: [
        { cliente: { nomeFantasia: { contains: busca, mode: "insensitive" } } },
        { cliente: { razaoSocial: { contains: busca, mode: "insensitive" } } },
        { fatura: { descricao: { contains: busca, mode: "insensitive" } } },
        { rotulo: { contains: busca, mode: "insensitive" } },
        { messageSid: { contains: busca, mode: "insensitive" } },
        { destino: { contains: busca, mode: "insensitive" } },
      ],
    });
  }
  const linhas = await prisma.filaWhatsapp.findMany({
    where: {
      empresaId: acesso.empresaId,
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.inicio || filtro.fim
        ? { criadoEm: { ...(filtro.inicio ? { gte: filtro.inicio } : {}), ...(filtro.fim ? { lte: filtro.fim } : {}) } }
        : {}),
      ...(e.length > 0 ? { AND: e } : {}),
    },
    include: includeLista,
    orderBy: { criadoEm: "desc" },
    take: LIMITE_LISTA,
  });
  const itens = linhas.map(resumoDe).filter((item) => (filtro.status ? item.status === filtro.status : true));
  return {
    itens,
    limiteAtingido: linhas.length === LIMITE_LISTA,
  };
}

export async function clientesComMensagem(acesso: Acesso) {
  exigirVer(acesso);
  return prisma.cliente.findMany({
    where: { empresaId: acesso.empresaId, filaWhatsapp: { some: {} } },
    select: { id: true, nomeFantasia: true },
    orderBy: { nomeFantasia: "asc" },
    take: 300,
  });
}

export async function obterMensagem(acesso: Acesso, id: string): Promise<MensagemDetalhe | null> {
  exigirVer(acesso);
  const linha = await prisma.filaWhatsapp.findFirst({
    where: { id, empresaId: acesso.empresaId },
    include: {
      ...includeLista,
      eventos: {
        select: { tipo: true, status: true, corpo: true, recebidoEm: true },
        orderBy: { recebidoEm: "asc" },
      },
    },
  });
  if (!linha) return null;
  const statusEventos = linha.eventos.filter((evento) => evento.tipo === "STATUS");
  const base = resumoDe({ ...linha, eventos: statusEventos });
  return {
    ...base,
    destino: linha.destino,
    tentativas: linha.tentativas,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    variaveis: linha.variaveis,
    eventos: statusEventos.map((evento) => ({
      quando: evento.recebidoEm.toISOString(),
      rotulo: evento.status,
      detalhe: evento.corpo,
    })),
  };
}

type Cadastro = { id: string; nomeFantasia: string; whatsapp: string; filiais: { whatsapp: string | null }[] };

function mapaDeClientes(clientes: Cadastro[]) {
  const mapa = new Map<string, { id: string; nome: string }[]>();
  function por(telefone: string | null, cliente: { id: string; nome: string }) {
    const chave = chaveTelefone(telefone);
    if (!chave) return;
    const lista = mapa.get(chave) ?? [];
    if (!lista.some((item) => item.id === cliente.id)) lista.push(cliente);
    mapa.set(chave, lista);
  }
  for (const cliente of clientes) {
    const item = { id: cliente.id, nome: cliente.nomeFantasia };
    por(cliente.whatsapp, item);
    for (const filial of cliente.filiais) por(filial.whatsapp, item);
  }
  return mapa;
}

async function clientesDosTelefones(empresaId: string, telefones: string[]) {
  const nacionais = [...new Set(telefones.map(nacionalDe))];
  if (nacionais.length === 0) return [];
  return prisma.cliente.findMany({
    where: {
      empresaId,
      OR: [{ whatsapp: { in: nacionais } }, { filiais: { some: { whatsapp: { in: nacionais } } } }],
    },
    select: { id: true, nomeFantasia: true, whatsapp: true, filiais: { select: { whatsapp: true } } },
  });
}

export async function listarConversas(acesso: Acesso, busca = ""): Promise<ResumoConversa[]> {
  exigirVer(acesso);
  const empresaId = acesso.empresaId;
  const [filas, entradas, respostas, leituras] = await Promise.all([
    prisma.filaWhatsapp.findMany({
      where: { empresaId },
      orderBy: { criadoEm: "desc" },
      take: 300,
      select: {
        id: true,
        criadoEm: true,
        rotulo: true,
        destino: true,
        cliente: { select: { id: true, nomeFantasia: true, whatsapp: true } },
      },
    }),
    prisma.eventoWhatsapp.findMany({
      where: { empresaId, tipo: "INBOUND" },
      orderBy: { recebidoEm: "desc" },
      take: 300,
      select: { id: true, de: true, corpo: true, recebidoEm: true },
    }),
    prisma.respostaWhatsapp.findMany({
      where: { empresaId },
      orderBy: { criadoEm: "desc" },
      take: 300,
      select: { id: true, telefone: true, corpo: true, criadoEm: true },
    }),
    prisma.leituraWhatsapp.findMany({ where: { empresaId }, select: { telefone: true, lidoEm: true } }),
  ]);
  const telefones = new Set<string>();
  for (const fila of filas) {
    const chave = chaveTelefone(fila.cliente.whatsapp) ?? chaveTelefone(fila.destino);
    if (chave) telefones.add(chave);
  }
  for (const entrada of entradas) {
    const chave = chaveTelefone(entrada.de);
    if (chave) telefones.add(chave);
  }
  for (const resposta of respostas) telefones.add(resposta.telefone);
  const mapa = mapaDeClientes(await clientesDosTelefones(empresaId, [...telefones]));
  const lido = new Map(leituras.map((item) => [item.telefone, item.lidoEm]));
  type Grupo = { ultima: Date; previa: string; naoLidas: number; nomes: { id: string; nome: string }[] };
  const grupos = new Map<string, Grupo>();
  function grupo(telefone: string): Grupo {
    const atual = grupos.get(telefone);
    if (atual) return atual;
    const criado: Grupo = { ultima: new Date(0), previa: "", naoLidas: 0, nomes: mapa.get(telefone) ?? [] };
    grupos.set(telefone, criado);
    return criado;
  }
  for (const fila of [...filas].reverse()) {
    const telefone = chaveTelefone(fila.cliente.whatsapp) ?? chaveTelefone(fila.destino);
    if (!telefone) continue;
    const item = grupo(telefone);
    if (fila.criadoEm >= item.ultima) {
      item.ultima = fila.criadoEm;
      item.previa = fila.rotulo;
    }
    if (item.nomes.length === 0) item.nomes = [{ id: fila.cliente.id, nome: fila.cliente.nomeFantasia }];
  }
  for (const entrada of [...entradas].reverse()) {
    const telefone = chaveTelefone(entrada.de);
    if (!telefone) continue;
    const item = grupo(telefone);
    const visto = lido.get(telefone);
    if (!visto || entrada.recebidoEm > visto) item.naoLidas += 1;
    if (entrada.recebidoEm >= item.ultima) {
      item.ultima = entrada.recebidoEm;
      item.previa = entrada.corpo?.trim() || "Mensagem recebida";
    }
  }
  for (const resposta of [...respostas].reverse()) {
    const item = grupo(resposta.telefone);
    if (resposta.criadoEm >= item.ultima) {
      item.ultima = resposta.criadoEm;
      item.previa = resposta.corpo;
    }
  }
  const termo = busca.trim().toLowerCase();
  return [...grupos.entries()]
    .map(([telefone, item]) => ({
      telefone,
      telefoneExibicao: formatarTelefone(telefone),
      nomes: item.nomes.map((nome) => nome.nome).join(", ") || "Número sem cadastro",
      clienteId: item.nomes[0]?.id ?? null,
      ultimaEm: item.ultima.toISOString(),
      previa: item.previa,
      naoLidas: item.naoLidas,
    }))
    .filter((item) => {
      if (!termo) return true;
      return (
        item.nomes.toLowerCase().includes(termo) ||
        item.telefone.includes(termo) ||
        item.telefoneExibicao.includes(termo) ||
        item.previa.toLowerCase().includes(termo)
      );
    })
    .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1))
    .slice(0, 80);
}

export async function obterConversa(
  acesso: Acesso,
  telefoneBruto: string,
  opcoes: { agora?: Date; marcarLida?: boolean } = {},
): Promise<ConversaMensagens | null> {
  exigirVer(acesso);
  const telefone = chaveTelefone(telefoneBruto);
  if (!telefone) return null;
  const empresaId = acesso.empresaId;
  const agora = opcoes.agora ?? new Date();
  const nacional = nacionalDe(telefone);
  const [filas, entradas, respostas, leitura, opt, clientes] = await Promise.all([
    prisma.filaWhatsapp.findMany({
      where: {
        empresaId,
        OR: [
          { cliente: { whatsapp: nacional } },
          { cliente: { whatsapp: telefone } },
          { destino: { in: formasTelefone(telefone) } },
          { cliente: { filiais: { some: { whatsapp: nacional } } } },
        ],
      },
      orderBy: { criadoEm: "asc" },
      take: 200,
      include: includeLista,
    }),
    prisma.eventoWhatsapp.findMany({
      where: { empresaId, tipo: "INBOUND", de: { in: formasTelefone(telefone) } },
      orderBy: { recebidoEm: "asc" },
    }),
    prisma.respostaWhatsapp.findMany({
      where: { empresaId, telefone },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.leituraWhatsapp.findUnique({ where: { empresaId_telefone: { empresaId, telefone } } }),
    prisma.optOutWhatsapp.findUnique({ where: { empresaId_telefone: { empresaId, telefone } } }),
    clientesDosTelefones(empresaId, [telefone]),
  ]);
  const daConversa = filas.filter((fila) => {
    const doCliente = chaveTelefone(fila.cliente.whatsapp) === telefone;
    const doDestino = chaveTelefone(fila.destino) === telefone;
    return doCliente || doDestino;
  });
  if (daConversa.length === 0 && entradas.length === 0 && respostas.length === 0) return null;
  const naoLidas = entradas.filter((entrada) => !leitura || entrada.recebidoEm > leitura.lidoEm).length;
  if (opcoes.marcarLida !== false && entradas.length > 0) {
    await prisma.leituraWhatsapp.upsert({
      where: { empresaId_telefone: { empresaId, telefone } },
      create: { empresaId, telefone, lidoEm: agora },
      update: { lidoEm: agora },
    });
  }
  const bolhas: BolhaConversa[] = [
    ...daConversa.map((fila) => {
      const resumo = resumoDe(fila);
      return {
        id: `fila-${fila.id}`,
        lado: "empresa" as const,
        quando: fila.criadoEm.toISOString(),
        texto: textoDoEnvio(fila.rotulo, fila.variaveis),
        detalhe: `${resumo.envio} · ${resumo.statusRotulo}`,
      };
    }),
    ...entradas.map((entrada) => ({
      id: `entrada-${entrada.id}`,
      lado: "cliente" as const,
      quando: entrada.recebidoEm.toISOString(),
      texto: entrada.corpo?.trim() || "(sem texto)",
      detalhe: entrada.status === "PARAR" ? "Pediu para parar" : "Recebida",
    })),
    ...respostas.map((resposta) => ({
      id: `resposta-${resposta.id}`,
      lado: "empresa" as const,
      quando: resposta.criadoEm.toISOString(),
      texto: resposta.corpo,
      detalhe: "Resposta da equipe",
    })),
  ].sort((a, b) => (a.quando < b.quando ? -1 : 1));
  const ultima = entradas.at(-1) ?? null;
  const janelaAte = ultima ? fimDaJanela(ultima.recebidoEm) : null;
  const optOut = opt?.ativo === true;
  const janelaAberta = Boolean(janelaAte && dentroDaJanela(janelaAte, agora) && !optOut);
  let aviso: string | null = null;
  if (optOut) aviso = TEXTO_OPT_OUT;
  else if (!ultima) aviso = TEXTO_SEM_ENTRADA;
  else if (!janelaAberta) aviso = TEXTO_FORA_DA_JANELA;
  const nomes = mapaDeClientes(clientes).get(telefone) ?? [];
  if (nomes.length === 0) {
    for (const fila of daConversa) {
      if (!nomes.some((item) => item.id === fila.cliente.id)) nomes.push({ id: fila.cliente.id, nome: fila.cliente.nomeFantasia });
    }
  }
  return {
    telefone,
    telefoneExibicao: formatarTelefone(telefone),
    clientes: nomes,
    naoLidas,
    janelaAberta,
    janelaAte: janelaAte?.toISOString() ?? null,
    optOut,
    aviso,
    bolhas,
  };
}

async function canalDeResposta(empresaId: string, para: string | null, env: NodeJS.ProcessEnv): Promise<{
  conta: CredencialTwilio;
  de: string;
  statusCallback: string;
}> {
  const empresa = await remetenteDaEmpresa(empresaId, "WHATSAPP", env);
  if (empresa && (!para || para === empresa.de || para.endsWith(empresa.telefoneE164))) {
    return { conta: empresa.conta, de: empresa.de, statusCallback: empresa.statusCallback };
  }
  const config = await prisma.configuracaoTwilio.findUnique({ where: { empresaId } });
  if (config?.senderTelefone && config.senderStatus === "ONLINE") {
    const bruto = config.senderTelefone.startsWith("whatsapp:")
      ? config.senderTelefone
      : `whatsapp:${config.senderTelefone.startsWith("+") ? config.senderTelefone : `+${config.senderTelefone}`}`;
    if (!para || para === bruto) {
      let authToken = "";
      try {
        authToken = decifrarSegredoAsaas(config.authTokenCifrado);
      } catch {
        throw new ErroAplicacao("Não consegui ler o token da Twilio.", 400, "whatsapp_offline");
      }
      return {
        conta: { accountSid: config.subaccountSid, authToken },
        de: bruto,
        statusCallback: config.webhookUrl,
      };
    }
  }
  if (para === REMETENTE_OFICIAL_WHATSAPP && remetenteOficialLigado(env)) {
    return {
      conta: credenciaisPaiTwilio(env),
      de: REMETENTE_OFICIAL_WHATSAPP,
      statusCallback: urlWebhookTwilio(env),
    };
  }
  if (para === REMETENTE_SANDBOX_WHATSAPP && sandboxWhatsappLigado(env)) {
    return {
      conta: credenciaisPaiTwilio(env),
      de: REMETENTE_SANDBOX_WHATSAPP,
      statusCallback: urlWebhookTwilio(env),
    };
  }
  throw new ErroAplicacao("Não há um número de WhatsApp desta empresa para responder nesta conversa.", 400, "whatsapp_offline");
}

// Só corre quando o usuário clica em enviar. Não há envio automático.
export async function responderWhatsapp(
  acesso: Acesso,
  entrada: unknown,
  opcoes: { twilio?: ClienteTwilio; env?: NodeJS.ProcessEnv; agora?: Date } = {},
) {
  exigirVer(acesso);
  const dados = lerEsquema(esquemaRespostaWhatsapp, entrada);
  const telefone = chaveTelefone(dados.telefone);
  if (!telefone) throw new ErroAplicacao("Telefone inválido.", 400, "telefone_invalido");
  const agora = opcoes.agora ?? new Date();
  const env = opcoes.env ?? process.env;
  const opt = await prisma.optOutWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId: acesso.empresaId, telefone } },
  });
  if (opt?.ativo) throw new ErroAplicacao(TEXTO_OPT_OUT, 400, "opt_out");
  const ultima = await prisma.eventoWhatsapp.findFirst({
    where: { empresaId: acesso.empresaId, tipo: "INBOUND", de: { in: formasTelefone(telefone) } },
    orderBy: { recebidoEm: "desc" },
  });
  if (!ultima) throw new ErroAplicacao(TEXTO_SEM_ENTRADA, 400, "janela");
  if (!dentroDaJanela(fimDaJanela(ultima.recebidoEm), agora)) {
    throw new ErroAplicacao(TEXTO_FORA_DA_JANELA, 400, "janela");
  }
  const canal = await canalDeResposta(acesso.empresaId, ultima.para, env);
  const twilio = opcoes.twilio ?? clienteTwilioPadrao(env);
  let sid = "";
  try {
    const enviada = await twilio.enviarTexto(canal.conta, {
      de: canal.de,
      para: `whatsapp:+${telefone}`,
      corpo: dados.texto,
      statusCallback: canal.statusCallback,
    });
    sid = enviada.sid;
  } catch (erro) {
    if (erro instanceof ErroTwilio) {
      throw new ErroAplicacao("A Twilio não aceitou a resposta. Nada foi reenviado.", 502, "twilio");
    }
    throw erro;
  }
  const clientes = await clientesDosTelefones(acesso.empresaId, [telefone]);
  await prisma.respostaWhatsapp.create({
    data: {
      empresaId: acesso.empresaId,
      telefone,
      clienteId: clientes[0]?.id,
      usuarioId: acesso.usuarioId,
      corpo: dados.texto,
      messageSid: sid,
    },
  });
  const conversa = await obterConversa(acesso, telefone, { agora, marcarLida: true });
  if (!conversa) throw new ErroAplicacao("Não foi possível abrir a conversa.", 500, "conversa");
  return conversa;
}
