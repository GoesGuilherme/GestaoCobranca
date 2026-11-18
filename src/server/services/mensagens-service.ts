import { fimDaJanela, dentroDaJanela } from "@/lib/assessor-escopo";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import {
  codificarCursorConversa,
  codificarCursorMensagem,
  conversaJaListada,
  lerCursorConversa,
  lerCursorMensagem,
  origemDoEnvio,
  ticksDoStatus,
  type BolhaConversa,
  type ConversaMensagens,
  type ResumoConversa,
} from "@/lib/caixa-mensagens";
import { isoDeData } from "@/lib/data";
import { somenteDigitos } from "@/lib/documento";
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
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

export type { BolhaConversa, ConversaMensagens, ResumoConversa };
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

function detalheEntrada(status: string): string {
  if (status === "PARAR") return "Pediu para parar";
  if (status === "PROMESSA_PEDIDO") return "Pediu para registrar promessa";
  if (status === "PROMESSA_DATA") return "Informou a data da promessa";
  if (status === "PROMESSA_REGISTRADA") return "Promessa registrada";
  if (status === "PROMESSA_RECUSADA") return "Promessa não registrada";
  return "Recebida";
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

const LOTE_CAIXA = 60;
const MAX_EVENTOS_CAIXA = 2500;
const LIMITE_CONVERSAS = 30;
const LIMITE_BOLHAS = 40;

type AtividadeCaixa = {
  id: string;
  quando: Date;
  telefone: string;
  previa: string;
  nomes: { id: string; nome: string }[];
  canal: CanalMensagem | null;
};

type CursorFonte = { quando: Date; id: string } | null;
type FonteCaixa = "fila" | "entrada" | "resposta";
type FiltroCaixa = FiltroMensagens & { inicio: Date | null; fim: Date | null };

function previaDe(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return "Mensagem recebida";
  return limpo.length > 140 ? `${limpo.slice(0, 137)}…` : limpo;
}

function faixaTempo(filtro: FiltroCaixa, cursor: CursorFonte | null, campo: "criadoEm" | "recebidoEm") {
  const faixa: { gte?: Date; lte?: Date } = {};
  if (filtro.inicio) faixa.gte = filtro.inicio;
  if (filtro.fim) faixa.lte = filtro.fim;
  const partes: Record<string, unknown>[] = [];
  if (Object.keys(faixa).length > 0) partes.push({ [campo]: faixa });
  if (cursor) {
    partes.push({
      OR: [{ [campo]: { lt: cursor.quando } }, { [campo]: cursor.quando, id: { lt: cursor.id } }],
    });
  }
  return partes;
}

async function telefonesDoCadastro(empresaId: string, busca: string): Promise<string[]> {
  const digitos = somenteDigitos(busca);
  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId,
      OR: [
        { nomeFantasia: { contains: busca, mode: "insensitive" } },
        { razaoSocial: { contains: busca, mode: "insensitive" } },
        ...(digitos.length >= 4 ? [{ whatsapp: { contains: digitos } }, { filiais: { some: { whatsapp: { contains: digitos } } } }] : []),
      ],
    },
    select: { whatsapp: true, filiais: { select: { whatsapp: true } } },
    take: 40,
  });
  const chaves: string[] = [];
  for (const cliente of clientes) {
    const principal = chaveTelefone(cliente.whatsapp);
    if (principal) chaves.push(principal);
    for (const filial of cliente.filiais) {
      const daFilial = chaveTelefone(filial.whatsapp);
      if (daFilial) chaves.push(daFilial);
    }
  }
  return [...new Set(chaves)];
}

async function telefonesDoCliente(empresaId: string, clienteId: string): Promise<string[] | null> {
  if (!clienteId) return null;
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { whatsapp: true, filiais: { select: { whatsapp: true } } },
  });
  if (!cliente) return [];
  const chaves: string[] = [];
  const principal = chaveTelefone(cliente.whatsapp);
  if (principal) chaves.push(principal);
  for (const filial of cliente.filiais) {
    const daFilial = chaveTelefone(filial.whatsapp);
    if (daFilial) chaves.push(daFilial);
  }
  return chaves;
}

function filtroCanalFila(canal: FiltroCaixa["canal"]): Prisma.FilaWhatsappWhereInput {
  if (canal === "SMS") {
    return { destino: { not: null }, NOT: { destino: { startsWith: "whatsapp:", mode: "insensitive" } } };
  }
  if (canal === "WHATSAPP") {
    return { OR: [{ destino: null }, { destino: { startsWith: "whatsapp:", mode: "insensitive" } }] };
  }
  return {};
}

async function buscarFila(empresaId: string, filtro: FiltroCaixa, cursor: CursorFonte, telefonesNome: string[], telefonesCliente: string[] | null) {
  const ou: Prisma.FilaWhatsappWhereInput[] = [];
  if (filtro.busca) {
    const digitos = somenteDigitos(filtro.busca);
    ou.push(
      { cliente: { nomeFantasia: { contains: filtro.busca, mode: "insensitive" } } },
      { cliente: { razaoSocial: { contains: filtro.busca, mode: "insensitive" } } },
      { fatura: { descricao: { contains: filtro.busca, mode: "insensitive" } } },
      { messageSid: { contains: filtro.busca, mode: "insensitive" } },
      { destino: { contains: filtro.busca, mode: "insensitive" } },
      { rotulo: { contains: filtro.busca, mode: "insensitive" } },
      ...(digitos.length >= 4 ? [{ cliente: { whatsapp: { contains: digitos } } }] : []),
    );
  }
  if (telefonesNome.length > 0) {
    const nacionais = [...new Set(telefonesNome.map(nacionalDe))];
    ou.push({ cliente: { whatsapp: { in: nacionais } } });
  }
  const linhas = await prisma.filaWhatsapp.findMany({
    where: {
      AND: [
        { empresaId },
        ...(filtro.clienteId ? [{ clienteId: filtro.clienteId }] : []),
        filtroCanalFila(filtro.canal),
        ...faixaTempo(filtro, cursor, "criadoEm"),
        ...(ou.length > 0 ? [{ OR: ou }] : []),
      ],
    },
    include: includeLista,
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: LOTE_CAIXA,
  });
  const itens: AtividadeCaixa[] = [];
  for (const linha of linhas) {
    const resumo = resumoDe(linha);
    if (filtro.status && resumo.status !== filtro.status) continue;
    const telefone = chaveTelefone(linha.cliente.whatsapp) ?? chaveTelefone(linha.destino);
    if (!telefone) continue;
    if (telefonesCliente && telefonesCliente.length > 0 && !telefonesCliente.includes(telefone) && linha.clienteId !== filtro.clienteId) continue;
    itens.push({
      id: linha.id,
      quando: linha.criadoEm,
      telefone,
      previa: previaDe(textoDoEnvio(linha.rotulo, linha.variaveis)),
      nomes: [{ id: linha.cliente.id, nome: linha.cliente.nomeFantasia }],
      canal: resumo.canal,
    });
  }
  const ultima = linhas.at(-1);
  return {
    itens,
    cursor: ultima ? { quando: ultima.criadoEm, id: ultima.id } : cursor,
    fim: linhas.length < LOTE_CAIXA,
  };
}

async function buscarEntrada(empresaId: string, filtro: FiltroCaixa, cursor: CursorFonte, telefonesNome: string[], telefonesCliente: string[] | null) {
  if (filtro.canal === "SMS" || filtro.status) return { itens: [] as AtividadeCaixa[], cursor, fim: true };
  if (telefonesCliente && telefonesCliente.length === 0) return { itens: [] as AtividadeCaixa[], cursor, fim: true };
  const ou: Prisma.EventoWhatsappWhereInput[] = [];
  if (filtro.busca) {
    ou.push(
      { corpo: { contains: filtro.busca, mode: "insensitive" } },
      { messageSid: { contains: filtro.busca, mode: "insensitive" } },
      { de: { contains: filtro.busca, mode: "insensitive" } },
    );
  }
  if (telefonesNome.length > 0) ou.push({ de: { in: telefonesNome.flatMap(formasTelefone) } });
  const linhas = await prisma.eventoWhatsapp.findMany({
    where: {
      AND: [
        { empresaId, tipo: "INBOUND" },
        ...(telefonesCliente && telefonesCliente.length > 0 ? [{ de: { in: telefonesCliente.flatMap(formasTelefone) } }] : []),
        ...faixaTempo(filtro, cursor, "recebidoEm"),
        ...(ou.length > 0 ? [{ OR: ou }] : []),
      ],
    },
    orderBy: [{ recebidoEm: "desc" }, { id: "desc" }],
    take: LOTE_CAIXA,
    select: { id: true, de: true, corpo: true, recebidoEm: true },
  });
  const itens: AtividadeCaixa[] = [];
  for (const linha of linhas) {
    const telefone = chaveTelefone(linha.de);
    if (!telefone) continue;
    itens.push({
      id: linha.id,
      quando: linha.recebidoEm,
      telefone,
      previa: previaDe(linha.corpo?.trim() || "Mensagem recebida"),
      nomes: [],
      canal: "WHATSAPP",
    });
  }
  const ultima = linhas.at(-1);
  return {
    itens,
    cursor: ultima ? { quando: ultima.recebidoEm, id: ultima.id } : cursor,
    fim: linhas.length < LOTE_CAIXA,
  };
}

async function buscarResposta(empresaId: string, filtro: FiltroCaixa, cursor: CursorFonte, telefonesNome: string[], telefonesCliente: string[] | null) {
  if (filtro.canal === "SMS" || filtro.status) return { itens: [] as AtividadeCaixa[], cursor, fim: true };
  if (telefonesCliente && telefonesCliente.length === 0) return { itens: [] as AtividadeCaixa[], cursor, fim: true };
  const ou: Prisma.RespostaWhatsappWhereInput[] = [];
  if (filtro.busca) {
    ou.push(
      { corpo: { contains: filtro.busca, mode: "insensitive" } },
      { messageSid: { contains: filtro.busca, mode: "insensitive" } },
      { telefone: { contains: somenteDigitos(filtro.busca) || filtro.busca } },
    );
  }
  if (telefonesNome.length > 0) ou.push({ telefone: { in: telefonesNome } });
  const linhas = await prisma.respostaWhatsapp.findMany({
    where: {
      AND: [
        { empresaId },
        ...(telefonesCliente && telefonesCliente.length > 0 ? [{ telefone: { in: telefonesCliente } }] : []),
        ...faixaTempo(filtro, cursor, "criadoEm"),
        ...(ou.length > 0 ? [{ OR: ou }] : []),
      ],
    },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: LOTE_CAIXA,
    select: { id: true, telefone: true, corpo: true, criadoEm: true },
  });
  const itens: AtividadeCaixa[] = linhas.map((linha) => ({
    id: linha.id,
    quando: linha.criadoEm,
    telefone: linha.telefone,
    previa: previaDe(linha.corpo),
    nomes: [],
    canal: "WHATSAPP" as const,
  }));
  const ultima = linhas.at(-1);
  return {
    itens,
    cursor: ultima ? { quando: ultima.criadoEm, id: ultima.id } : cursor,
    fim: linhas.length < LOTE_CAIXA,
  };
}

function maisRecente(atual: AtividadeCaixa, candidata: AtividadeCaixa): AtividadeCaixa {
  const diferenca = atual.quando.getTime() - candidata.quando.getTime();
  if (diferenca !== 0) return diferenca > 0 ? atual : candidata;
  return atual.telefone >= candidata.telefone ? atual : candidata;
}

async function contarNaoLidas(empresaId: string, telefones: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (telefones.length === 0) return mapa;
  const leituras = await prisma.leituraWhatsapp.findMany({
    where: { empresaId, telefone: { in: telefones } },
    select: { telefone: true, lidoEm: true },
  });
  const lido = new Map(leituras.map((item) => [item.telefone, item.lidoEm]));
  const valores = Prisma.join(
    telefones.map((telefone) => Prisma.sql`(${telefone}, ${lido.get(telefone) ?? new Date(0)}::timestamptz)`),
  );
  const linhas = await prisma.$queryRaw<Array<{ telefone: string; total: number }>>`
    SELECT chave.telefone, COUNT(e.id)::int AS total
    FROM (VALUES ${valores}) AS chave(telefone, desde)
    LEFT JOIN eventos_whatsapp e
      ON e.empresa_id = ${empresaId}
     AND e.tipo = 'INBOUND'
     AND e.recebido_em > chave.desde
     AND (
       e.de = 'whatsapp:+' || chave.telefone
       OR e.de = '+' || chave.telefone
       OR e.de = chave.telefone
     )
    GROUP BY chave.telefone
  `;
  for (const linha of linhas) mapa.set(linha.telefone, Number(linha.total));
  return mapa;
}

export async function listarCaixaMensagens(
  acesso: Acesso,
  filtro: FiltroCaixa,
  opcoes: { cursor?: string | null; limite?: number } = {},
): Promise<{ itens: ResumoConversa[]; proximoCursor: string | null }> {
  exigirVer(acesso);
  const empresaId = acesso.empresaId;
  const limite = Math.min(Math.max(opcoes.limite ?? LIMITE_CONVERSAS, 1), 80);
  const corte = lerCursorConversa(opcoes.cursor);
  const telefonesCliente = await telefonesDoCliente(empresaId, filtro.clienteId);
  if (telefonesCliente && telefonesCliente.length === 0 && filtro.clienteId) {
    const existe = await prisma.cliente.findFirst({ where: { id: filtro.clienteId, empresaId }, select: { id: true } });
    if (!existe) return { itens: [], proximoCursor: null };
  }
  const telefonesNome = filtro.busca ? await telefonesDoCadastro(empresaId, filtro.busca) : [];
  const estado: Record<FonteCaixa, { itens: AtividadeCaixa[]; indice: number; cursor: CursorFonte; fim: boolean }> = {
    fila: { itens: [], indice: 0, cursor: null, fim: false },
    entrada: { itens: [], indice: 0, cursor: null, fim: filtro.canal === "SMS" || Boolean(filtro.status) },
    resposta: { itens: [], indice: 0, cursor: null, fim: filtro.canal === "SMS" || Boolean(filtro.status) },
  };

  async function garantir(fonte: FonteCaixa) {
    const atual = estado[fonte];
    if (atual.fim || atual.indice < atual.itens.length) return;
    const lote =
      fonte === "fila"
        ? await buscarFila(empresaId, filtro, atual.cursor, telefonesNome, telefonesCliente)
        : fonte === "entrada"
          ? await buscarEntrada(empresaId, filtro, atual.cursor, telefonesNome, telefonesCliente)
          : await buscarResposta(empresaId, filtro, atual.cursor, telefonesNome, telefonesCliente);
    atual.itens = lote.itens;
    atual.indice = 0;
    atual.cursor = lote.cursor;
    atual.fim = lote.fim;
  }

  async function proxima(): Promise<{ atividade: AtividadeCaixa | null; esgotou: boolean }> {
    const fontes = Object.keys(estado) as FonteCaixa[];
    for (let volta = 0; volta < 80; volta += 1) {
      await Promise.all(fontes.map((fonte) => garantir(fonte)));
      let escolhida: { fonte: FonteCaixa; item: AtividadeCaixa } | null = null;
      for (const fonte of fontes) {
        const item = estado[fonte].indice < estado[fonte].itens.length ? estado[fonte].itens[estado[fonte].indice] : null;
        if (!item) continue;
        if (!escolhida || maisRecente(item, escolhida.item) === item) escolhida = { fonte, item };
      }
      if (escolhida) {
        estado[escolhida.fonte].indice += 1;
        return { atividade: escolhida.item, esgotou: false };
      }
      if (fontes.every((fonte) => estado[fonte].fim)) return { atividade: null, esgotou: true };
    }
    return { atividade: null, esgotou: false };
  }

  const aceitas: AtividadeCaixa[] = [];
  const vistas = new Set<string>();
  let examinados = 0;
  let esgotou = false;
  while (aceitas.length <= limite && examinados < MAX_EVENTOS_CAIXA) {
    const lote = await proxima();
    if (!lote.atividade) {
      esgotou = lote.esgotou;
      break;
    }
    examinados += 1;
    if (vistas.has(lote.atividade.telefone)) continue;
    vistas.add(lote.atividade.telefone);
    if (conversaJaListada(lote.atividade.quando.toISOString(), lote.atividade.telefone, corte)) continue;
    aceitas.push(lote.atividade);
  }

  const pagina = aceitas.slice(0, limite);
  const ultima = pagina.at(-1);
  const proximoCursor =
    ultima && (aceitas.length > limite || !esgotou) ? codificarCursorConversa(ultima.quando.toISOString(), ultima.telefone) : null;
  const telefones = pagina.map((item) => item.telefone);
  const [mapa, naoLidas] = await Promise.all([
    clientesDosTelefones(empresaId, telefones).then((clientes) => mapaDeClientes(clientes)),
    contarNaoLidas(empresaId, telefones),
  ]);

  return {
    itens: pagina.map((item) => {
      const nomes = mapa.get(item.telefone) ?? item.nomes;
      return {
        telefone: item.telefone,
        telefoneExibicao: formatarTelefone(item.telefone),
        nomes: nomes.map((nome) => nome.nome).join(", ") || "Número sem cadastro",
        clienteId: nomes[0]?.id ?? null,
        clienteIds: nomes.map((nome) => nome.id),
        ultimaEm: item.quando.toISOString(),
        previa: item.previa,
        naoLidas: naoLidas.get(item.telefone) ?? 0,
        fotoUrl: null,
        canal: item.canal,
      };
    }),
    proximoCursor,
  };
}

export async function listarConversas(acesso: Acesso, busca = ""): Promise<ResumoConversa[]> {
  const filtro = lerFiltroMensagens({ periodo: "todos", q: busca }, "2026-01-01");
  const pagina = await listarCaixaMensagens(acesso, filtro, { limite: 80 });
  return pagina.itens;
}

function bolhaDaFila(fila: {
  id: string;
  criadoEm: Date;
  status: string;
  motivo: string | null;
  destino: string | null;
  messageSid: string | null;
  tipo: string;
  rotulo: string;
  modoTeste: boolean;
  variaveis: string;
  cliente: { id: string; nomeFantasia: string; whatsapp: string };
  fatura: { id: string; descricao: string | null; vencimento: Date };
  passo: PassoEnvio;
  eventos: { status: string; corpo: string | null; recebidoEm: Date }[];
}): BolhaConversa {
  const resumo = resumoDe(fila);
  const origem = origemDoEnvio({
    tipo: fila.tipo,
    rotulo: fila.rotulo,
    passo: fila.passo ? { naEmissao: fila.passo.naEmissao, dias: fila.passo.dias, assunto: fila.passo.assunto } : null,
  });
  return {
    id: `fila-${fila.id}`,
    lado: "empresa",
    quando: fila.criadoEm.toISOString(),
    texto: textoDoEnvio(fila.rotulo, fila.variaveis),
    detalhe: `${resumo.envio} · ${resumo.statusRotulo}`,
    origem: origem.origem,
    template: origem.template,
    cobrancaId: resumo.faturaId,
    cobranca: resumo.fatura,
    canal: resumo.canal,
    ticks: ticksDoStatus(resumo.status),
    motivo: resumo.motivo,
    modoTeste: fila.modoTeste,
  };
}

function bolhaDaEntrada(entrada: { id: string; corpo: string | null; status: string; recebidoEm: Date }): BolhaConversa {
  const texto = entrada.corpo?.trim() || (entrada.status === "PROMESSA_PEDIDO" ? "Registrar promessa" : "(sem texto)");
  const detalhe = detalheEntrada(entrada.status);
  return {
    id: `entrada-${entrada.id}`,
    lado: "cliente",
    quando: entrada.recebidoEm.toISOString(),
    texto,
    detalhe,
    origem: entrada.status.startsWith("PROMESSA") ? detalhe : null,
    template: null,
    cobrancaId: null,
    cobranca: null,
    canal: "WHATSAPP",
    ticks: null,
    motivo: null,
    modoTeste: false,
  };
}

function bolhaDaResposta(resposta: { id: string; corpo: string; origem: string; criadoEm: Date; messageSid: string | null }): BolhaConversa {
  const promessa = resposta.origem === "PROMESSA";
  const ia = resposta.origem === "IA";
  return {
    id: `resposta-${resposta.id}`,
    lado: "empresa",
    quando: resposta.criadoEm.toISOString(),
    texto: resposta.corpo,
    detalhe: ia ? "IA" : promessa ? "Promessa de pagamento" : "Resposta da equipe",
    origem: ia ? "IA" : promessa ? "Promessa de pagamento" : "Manual",
    template: null,
    cobrancaId: null,
    cobranca: null,
    canal: "WHATSAPP",
    ticks: resposta.messageSid ? "enviada" : null,
    motivo: null,
    modoTeste: false,
  };
}

function ondeAntesDe(cursor: Date | null, campo: "criadoEm" | "recebidoEm", filtro: FiltroCaixa) {
  const faixa: { gte?: Date; lte?: Date; lt?: Date } = {};
  if (filtro.inicio) faixa.gte = filtro.inicio;
  if (filtro.fim) faixa.lte = filtro.fim;
  if (cursor) faixa.lt = cursor;
  return Object.keys(faixa).length > 0 ? { [campo]: faixa } : {};
}

export async function abrirConversaMensagens(
  acesso: Acesso,
  telefoneBruto: string,
  opcoes: {
    agora?: Date;
    marcarLida?: boolean;
    antes?: string | null;
    limite?: number;
    filtro?: FiltroCaixa;
  } = {},
): Promise<ConversaMensagens | null> {
  exigirVer(acesso);
  const telefone = chaveTelefone(telefoneBruto);
  if (!telefone) return null;
  const empresaId = acesso.empresaId;
  const agora = opcoes.agora ?? new Date();
  const filtro = opcoes.filtro ?? lerFiltroMensagens({ periodo: "todos" }, "2026-01-01");
  const limite = Math.min(Math.max(opcoes.limite ?? LIMITE_BOLHAS, 1), 200);
  const antes = lerCursorMensagem(opcoes.antes);
  const nacional = nacionalDe(telefone);
  const formas = formasTelefone(telefone);
  const baseFila = {
    empresaId,
    OR: [
      { cliente: { whatsapp: { in: [nacional, telefone] } } },
      { destino: { in: formas } },
      { cliente: { filiais: { some: { whatsapp: { in: [nacional, telefone] } } } } },
    ],
  };
  const baseEntrada = { empresaId, tipo: "INBOUND", de: { in: formas } };
  const baseResposta = { empresaId, telefone };
  const querWhatsapp = filtro.canal !== "SMS";
  const querFila = true;
  const pedido = limite + 1;

  const [temFila, ultimaEntrada, temResposta, leitura, opt, clientes] = await Promise.all([
    prisma.filaWhatsapp.findFirst({ where: baseFila, select: { id: true } }),
    prisma.eventoWhatsapp.findFirst({ where: baseEntrada, orderBy: { recebidoEm: "desc" } }),
    prisma.respostaWhatsapp.findFirst({ where: baseResposta, select: { id: true } }),
    prisma.leituraWhatsapp.findUnique({ where: { empresaId_telefone: { empresaId, telefone } } }),
    prisma.optOutWhatsapp.findUnique({ where: { empresaId_telefone: { empresaId, telefone } } }),
    clientesDosTelefones(empresaId, [telefone]),
  ]);
  if (!temFila && !ultimaEntrada && !temResposta) return null;

  const naoLidas = await prisma.eventoWhatsapp.count({
    where: {
      ...baseEntrada,
      ...(leitura ? { recebidoEm: { gt: leitura.lidoEm } } : {}),
    },
  });

  const [filas, entradas, respostas] = await Promise.all([
    querFila
      ? prisma.filaWhatsapp.findMany({
          where: { AND: [baseFila, filtroCanalFila(filtro.canal), ondeAntesDe(antes, "criadoEm", filtro)] },
          orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
          take: pedido,
          include: {
            ...includeLista,
            cliente: {
              select: { id: true, nomeFantasia: true, whatsapp: true, filiais: { select: { whatsapp: true } } },
            },
          },
        })
      : Promise.resolve([]),
    querWhatsapp
      ? prisma.eventoWhatsapp.findMany({
          where: { AND: [baseEntrada, ondeAntesDe(antes, "recebidoEm", filtro)] },
          orderBy: [{ recebidoEm: "desc" }, { id: "desc" }],
          take: pedido,
        })
      : Promise.resolve([]),
    querWhatsapp
      ? prisma.respostaWhatsapp.findMany({
          where: { AND: [baseResposta, ondeAntesDe(antes, "criadoEm", filtro)] },
          orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
          take: pedido,
        })
      : Promise.resolve([]),
  ]);

  const daConversa = filas.filter((fila) => {
    const doCliente = chaveTelefone(fila.cliente.whatsapp) === telefone;
    const doDestino = chaveTelefone(fila.destino) === telefone;
    const daFilial = fila.cliente.filiais.some((filial) => chaveTelefone(filial.whatsapp) === telefone);
    return doCliente || doDestino || daFilial;
  });

  const candidatas: BolhaConversa[] = [
    ...daConversa.map((fila) => bolhaDaFila(fila)),
    ...entradas.map((entrada) => bolhaDaEntrada(entrada)),
    ...respostas.map((resposta) => bolhaDaResposta(resposta)),
  ].sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));

  let escolhidas = candidatas.slice(0, limite);
  const corte = escolhidas.at(-1)?.quando;
  if (corte) {
    escolhidas = escolhidas.concat(candidatas.slice(limite).filter((bolha) => bolha.quando === corte));
  }
  const fonteCheia = filas.length === pedido || entradas.length === pedido || respostas.length === pedido;
  const sobrou = candidatas.length > escolhidas.length || (fonteCheia && escolhidas.length >= limite);
  const maisAntiga = escolhidas.at(-1);
  const proximoCursor = sobrou && maisAntiga ? codificarCursorMensagem(maisAntiga.quando) : null;
  const bolhas = [...escolhidas].reverse();

  if (opcoes.marcarLida !== false && !antes && ultimaEntrada) {
    await prisma.leituraWhatsapp.upsert({
      where: { empresaId_telefone: { empresaId, telefone } },
      create: { empresaId, telefone, lidoEm: agora },
      update: { lidoEm: agora },
    });
  }
  const janelaAte = ultimaEntrada ? fimDaJanela(ultimaEntrada.recebidoEm) : null;
  const optOut = opt?.ativo === true;
  const janelaAberta = Boolean(janelaAte && dentroDaJanela(janelaAte, agora) && !optOut);
  let aviso: string | null = null;
  if (optOut) aviso = TEXTO_OPT_OUT;
  else if (!ultimaEntrada) aviso = TEXTO_SEM_ENTRADA;
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
    proximoCursor,
  };
}

export async function obterConversa(
  acesso: Acesso,
  telefoneBruto: string,
  opcoes: { agora?: Date; marcarLida?: boolean } = {},
): Promise<ConversaMensagens | null> {
  return abrirConversaMensagens(acesso, telefoneBruto, { ...opcoes, limite: 200 });
}

export async function canalRespostaWhatsapp(empresaId: string, para: string | null, env: NodeJS.ProcessEnv = process.env): Promise<{
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
  const canal = await canalRespostaWhatsapp(acesso.empresaId, ultima.para, env);
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
