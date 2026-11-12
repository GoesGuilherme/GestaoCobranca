import { decifrarSegredoAsaas, cifrarSegredoAsaas } from "@/lib/asaas-cripto";
import {
  canalTwilio,
  criacaoSubcontaHabilitada,
  normalizarTelefoneTwilio,
  rotuloCanalTwilio,
  rotuloStatusNumeroTwilio,
  rotuloStatusSubconta,
  rotuloStatusTemplateWhatsapp,
  rotuloTipoTemplateWhatsapp,
  statusNumeroTwilio,
  type CanalTwilioEmpresa,
  type StatusNumeroTwilio,
} from "@/lib/twilio-empresa";
import type { NumeroTwilioDTO, PainelTelefonesDTO, TemplateTelefoneDTO } from "@/lib/tipos";
import { esquemaNumeroTwilio, esquemaStatusNumeroTwilio, esquemaSubcontaExistente, esquemaTemplatesWhatsappEmpresa } from "@/lib/validacao";
import { contentSidValido, templateCobrancaWhatsapp, TIPOS_TEMPLATE_WHATSAPP, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";
import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { statusAprovacao, type ClienteTwilio, type ConteudoComAprovacao, type CredencialTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao, credenciaisPaiTwilio } from "@/server/twilio/fabrica";
import { remetenteDaEmpresa } from "@/server/twilio/remetente";
import { lerEsquema } from "@/server/validar";

const LIMITE_NUMEROS = 20;
const SID_CONTA = /^AC[0-9a-fA-F]{32}$/;

type LinhaNumero = {
  id: string;
  telefoneE164: string;
  canal: string;
  status: string;
  padrao: boolean;
};

function templatesDoPainel(
  linhas: { tipo: string; contentSid: string | null; status: string; motivo?: string | null }[],
): TemplateTelefoneDTO[] {
  return TIPOS_TEMPLATE_WHATSAPP.map((tipo) => {
    const linha = linhas.find((item) => item.tipo === tipo);
    const status = linha?.status ?? "";
    return {
      tipo,
      rotulo: rotuloTipoTemplateWhatsapp(tipo),
      contentSid: linha?.contentSid ?? null,
      status,
      statusRotulo: rotuloStatusTemplateWhatsapp(status || null),
      motivo: linha?.motivo ?? null,
    };
  });
}

function numeroDe(linha: LinhaNumero): NumeroTwilioDTO {
  const canal = canalTwilio(linha.canal) ?? "WHATSAPP";
  const status = statusNumeroTwilio(linha.status) ?? "CADASTRADO";
  return {
    id: linha.id,
    telefoneE164: linha.telefoneE164,
    canal,
    canalRotulo: rotuloCanalTwilio(canal),
    status,
    statusRotulo: rotuloStatusNumeroTwilio(status),
    padrao: linha.padrao,
  };
}

async function credencialLegivel(cifra: string): Promise<boolean> {
  try {
    const claro = decifrarSegredoAsaas(cifra);
    return claro.length >= 16;
  } catch {
    return false;
  }
}

export async function obterPainelTelefones(
  acesso: Acesso,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const [subconta, numeros, modelos, whatsapp, sms] = await Promise.all([
    prisma.subcontaTwilio.findUnique({ where: { empresaId: acesso.empresaId } }),
    prisma.numeroTwilioEmpresa.findMany({
      where: { empresaId: acesso.empresaId },
      orderBy: [{ canal: "asc" }, { criadoEm: "asc" }],
    }),
    prisma.templateWhatsapp.findMany({
      where: { empresaId: acesso.empresaId },
      select: { tipo: true, contentSid: true, status: true, motivo: true },
    }),
    remetenteDaEmpresa(acesso.empresaId, "WHATSAPP", env),
    remetenteDaEmpresa(acesso.empresaId, "SMS", env),
  ]);
  const legivel = subconta ? await credencialLegivel(subconta.credencialCifrada) : false;
  return {
    subconta: subconta
      ? {
          sid: subconta.subaccountSid,
          status: "CONFIGURADA",
          statusRotulo: rotuloStatusSubconta(subconta.status, legivel),
          credencialMascarada: `••••${subconta.credencialUltimos4.slice(-4)}`,
          legivel,
        }
      : null,
    criacaoHabilitada: criacaoSubcontaHabilitada(env),
    numeros: numeros.map(numeroDe),
    templates: templatesDoPainel(modelos),
    envioWhatsapp: whatsapp ? "empresa" : "global",
    envioSms: sms ? "empresa" : "global",
  };
}

async function marcarPadrao(empresaId: string, canal: CanalTwilioEmpresa, id: string) {
  await prisma.$transaction([
    prisma.numeroTwilioEmpresa.updateMany({
      where: { empresaId, canal, padrao: true, NOT: { id } },
      data: { padrao: false },
    }),
    prisma.numeroTwilioEmpresa.update({
      where: { id },
      data: { padrao: true },
    }),
  ]);
}

export async function cadastrarNumeroTwilio(acesso: Acesso, entrada: unknown): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const dados = lerEsquema(esquemaNumeroTwilio, entrada);
  const telefone = normalizarTelefoneTwilio(dados.telefone);
  if (!telefone) {
    throw new ErroAplicacao("Informe o número em E.164, com DDI. Exemplo: +5511999990000.", 400, "telefone_invalido");
  }
  const canal = canalTwilio(dados.canal);
  if (!canal) {
    throw new ErroAplicacao("Escolha WhatsApp ou SMS.", 400, "canal_invalido");
  }
  const total = await prisma.numeroTwilioEmpresa.count({ where: { empresaId: acesso.empresaId } });
  if (total >= LIMITE_NUMEROS) {
    throw new ErroAplicacao("Esta empresa já tem 20 números cadastrados.", 400, "limite_numeros");
  }
  const jaPadrao = await prisma.numeroTwilioEmpresa.findFirst({
    where: { empresaId: acesso.empresaId, canal, padrao: true },
    select: { id: true },
  });
  try {
    await prisma.numeroTwilioEmpresa.create({
      data: {
        empresaId: acesso.empresaId,
        telefoneE164: telefone,
        canal,
        status: "CADASTRADO",
        padrao: !jaPadrao,
      },
    });
  } catch (erro) {
    if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002") {
      throw new ErroAplicacao("Este número já está cadastrado neste canal.", 409, "numero_duplicado");
    }
    throw erro;
  }
  return obterPainelTelefones(acesso);
}

export async function atualizarNumeroTwilio(
  acesso: Acesso,
  id: string,
  entrada: unknown,
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const dados = lerEsquema(esquemaStatusNumeroTwilio, entrada);
  const linha = await prisma.numeroTwilioEmpresa.findFirst({
    where: { id, empresaId: acesso.empresaId },
  });
  if (!linha) {
    throw new ErroAplicacao("Número não encontrado.", 404, "numero_ausente");
  }
  const canal = canalTwilio(linha.canal);
  if (!canal) {
    throw new ErroAplicacao("O canal deste número está inválido.", 500, "canal_invalido");
  }
  if (dados.status) {
    const status = statusNumeroTwilio(dados.status);
    if (!status) {
      throw new ErroAplicacao("Escolha o status do número.", 400, "status_invalido");
    }
    await prisma.numeroTwilioEmpresa.update({
      where: { id: linha.id },
      data: { status: status satisfies StatusNumeroTwilio },
    });
  }
  if (dados.padrao === true) await marcarPadrao(acesso.empresaId, canal, linha.id);
  if (dados.padrao === false) {
    await prisma.numeroTwilioEmpresa.update({ where: { id: linha.id }, data: { padrao: false } });
  }
  return obterPainelTelefones(acesso);
}

export async function removerNumeroTwilio(acesso: Acesso, id: string): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const apagado = await prisma.numeroTwilioEmpresa.deleteMany({
    where: { id, empresaId: acesso.empresaId },
  });
  if (apagado.count !== 1) {
    throw new ErroAplicacao("Número não encontrado.", 404, "numero_ausente");
  }
  return obterPainelTelefones(acesso);
}

export async function criarSubcontaTwilio(
  acesso: Acesso,
  opcoes: { twilio?: ClienteTwilio; env?: NodeJS.ProcessEnv } = {},
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const env = opcoes.env ?? process.env;
  if (!criacaoSubcontaHabilitada(env)) {
    throw new ErroAplicacao(
      "A criação de subconta na Twilio está desligada. Os envios continuam na conta global.",
      403,
      "twilio_subconta_desligada",
    );
  }
  const existente = await prisma.subcontaTwilio.findUnique({ where: { empresaId: acesso.empresaId } });
  if (existente) {
    throw new ErroAplicacao("Esta empresa já tem subconta Twilio.", 409, "twilio_subconta_existente");
  }
  const pai = credenciaisPaiTwilio(env);
  const cliente = opcoes.twilio ?? clienteTwilioPadrao(env);
  let criada: { sid: string; authToken: string };
  try {
    criada = await cliente.criarSubconta(pai, `Taguaro ${acesso.empresaId}`.slice(0, 64));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao falar com a Twilio.";
    throw new ErroAplicacao(mensagem.slice(0, 240), 502, "twilio");
  }
  if (!SID_CONTA.test(criada.sid) || criada.authToken.trim().length < 16) {
    throw new ErroAplicacao("A Twilio não devolveu a subconta.", 502, "twilio");
  }
  const token = criada.authToken.trim();
  await prisma.subcontaTwilio.create({
    data: {
      empresaId: acesso.empresaId,
      subaccountSid: criada.sid,
      credencialCifrada: cifrarSegredoAsaas(token),
      credencialUltimos4: token.slice(-4),
      status: "CONFIGURADA",
    },
  });
  return obterPainelTelefones(acesso, env);
}

function textoSemSegredo(texto: string, segredos: string[]) {
  let limpo = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) limpo = limpo.split(segredo).join("[redigido]");
  }
  return limpo.slice(0, 240);
}

// Não cria subconta. A conta pai lê o auth token do SID informado e o banco
// guarda só a cifra. O token não volta na resposta e não entra em log.
export async function gravarSubcontaExistente(
  empresaId: string,
  sid: string,
  opcoes: { twilio?: ClienteTwilio; env?: NodeJS.ProcessEnv } = {},
) {
  const env = opcoes.env ?? process.env;
  const pai = credenciaisPaiTwilio(env);
  if (sid === pai.accountSid) {
    throw new ErroAplicacao("Informe o SID da subconta, não o da conta pai.", 400, "twilio_sid_pai");
  }
  const existente = await prisma.subcontaTwilio.findUnique({ where: { empresaId } });
  if (existente && existente.subaccountSid !== sid) {
    throw new ErroAplicacao("Esta empresa já tem outra subconta.", 409, "twilio_subconta_existente");
  }
  const deOutra = await prisma.subcontaTwilio.findUnique({ where: { subaccountSid: sid } });
  if (deOutra && deOutra.empresaId !== empresaId) {
    throw new ErroAplicacao("Este SID já está vinculado a outra empresa.", 409, "twilio_sid_em_uso");
  }
  const cliente = opcoes.twilio ?? clienteTwilioPadrao(env);
  let token = "";
  try {
    const obtida = await cliente.obterSubconta(pai, sid);
    token = obtida.authToken.trim();
    if (obtida.sid !== sid || token.length < 16) {
      throw new ErroAplicacao("A Twilio não devolveu a subconta.", 502, "twilio");
    }
  } catch (erro) {
    const bruto = erro instanceof Error ? erro.message : "Falha ao falar com a Twilio.";
    const status = erro instanceof ErroAplicacao ? erro.status : 502;
    const codigo = erro instanceof ErroAplicacao ? erro.codigo : "twilio";
    throw new ErroAplicacao(textoSemSegredo(bruto, [pai.authToken, token]), status, codigo);
  }
  const dados = {
    subaccountSid: sid,
    credencialCifrada: cifrarSegredoAsaas(token),
    credencialUltimos4: token.slice(-4),
    status: "CONFIGURADA",
  };
  if (existente) {
    await prisma.subcontaTwilio.update({ where: { empresaId }, data: dados });
  } else {
    await prisma.subcontaTwilio.create({ data: { empresaId, ...dados } });
  }
}

export async function vincularSubcontaExistente(
  acesso: Acesso,
  entrada: unknown,
  opcoes: { twilio?: ClienteTwilio; env?: NodeJS.ProcessEnv } = {},
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const dados = lerEsquema(esquemaSubcontaExistente, entrada);
  const env = opcoes.env ?? process.env;
  await gravarSubcontaExistente(acesso.empresaId, dados.subaccountSid, { ...opcoes, env });
  return obterPainelTelefones(acesso, env);
}

type OpcoesTwilioEmpresa = { twilio?: ClienteTwilio; env?: NodeJS.ProcessEnv };

async function contaDaSubconta(empresaId: string): Promise<CredencialTwilio> {
  const subconta = await prisma.subcontaTwilio.findUnique({ where: { empresaId } });
  if (!subconta || subconta.status !== "CONFIGURADA") {
    throw new ErroAplicacao("Vincule a subconta antes de consultar os modelos.", 400, "twilio_sem_subconta");
  }
  let token = "";
  try {
    token = decifrarSegredoAsaas(subconta.credencialCifrada).trim();
  } catch {
    token = "";
  }
  if (token.length < 16) {
    throw new ErroAplicacao("A credencial da subconta está ilegível.", 500, "twilio_ilegivel");
  }
  return { accountSid: subconta.subaccountSid, authToken: token };
}

async function aprovacoesDaSubconta(
  empresaId: string,
  opcoes: OpcoesTwilioEmpresa,
): Promise<Map<string, ConteudoComAprovacao>> {
  const conta = await contaDaSubconta(empresaId);
  const cliente = opcoes.twilio ?? clienteTwilioPadrao(opcoes.env ?? process.env);
  try {
    const lista = await cliente.listarConteudosComAprovacao(conta);
    return new Map(lista.map((item) => [item.sid, item]));
  } catch (erro) {
    if (erro instanceof ErroAplicacao) {
      throw new ErroAplicacao(textoSemSegredo(erro.message, [conta.authToken]), erro.status, erro.codigo);
    }
    const bruto = erro instanceof Error ? erro.message : "Falha ao falar com a Twilio.";
    throw new ErroAplicacao(textoSemSegredo(bruto, [conta.authToken]), 502, "twilio");
  }
}

function dadosDoModelo(tipo: TipoTemplateWhatsapp, contentSid: string, encontrado: ConteudoComAprovacao) {
  const modelo = templateCobrancaWhatsapp(tipo);
  const status = statusAprovacao(encontrado.aprovacao);
  const motivo = status === "REJEITADO" ? (encontrado.motivo || "A Meta recusou este modelo.").slice(0, 500) : null;
  return {
    contentSid,
    nome: encontrado.nome.trim().slice(0, 120) || modelo.nome,
    idioma: "pt_BR",
    categoria: "UTILITY",
    status,
    corpo: modelo.corpo,
    motivo,
  };
}

function validarListaDeModelos(entrada: unknown) {
  const dados = lerEsquema(esquemaTemplatesWhatsappEmpresa, entrada);
  const vistos = new Set<string>();
  for (const item of dados.templates) {
    if (vistos.has(item.tipo)) {
      throw new ErroAplicacao("Cada tipo de modelo entra uma vez.", 400, "template_duplicado");
    }
    vistos.add(item.tipo);
    if (item.contentSid && !contentSidValido(item.contentSid)) {
      throw new ErroAplicacao(
        `O ContentSid de ${rotuloTipoTemplateWhatsapp(item.tipo)} começa com HX e tem 34 caracteres.`,
        400,
        "content_sid_invalido",
      );
    }
  }
  return dados.templates;
}

export async function gravarTemplatesDaEmpresa(
  empresaId: string,
  entrada: unknown,
  opcoes: OpcoesTwilioEmpresa = {},
) {
  const templates = validarListaDeModelos(entrada);
  const comSid = templates.filter((item) => item.contentSid);
  const aprovacoes = comSid.length > 0 ? await aprovacoesDaSubconta(empresaId, opcoes) : new Map<string, ConteudoComAprovacao>();
  for (const item of comSid) {
    if (!aprovacoes.has(item.contentSid)) {
      throw new ErroAplicacao(
        `O ContentSid de ${rotuloTipoTemplateWhatsapp(item.tipo)} não está nesta subconta.`,
        400,
        "content_sid_ausente",
      );
    }
  }
  for (const item of templates) {
    const tipo = item.tipo as TipoTemplateWhatsapp;
    if (!item.contentSid) {
      await prisma.templateWhatsapp.deleteMany({ where: { empresaId, tipo } });
      continue;
    }
    const encontrado = aprovacoes.get(item.contentSid);
    if (!encontrado) continue;
    const gravado = dadosDoModelo(tipo, item.contentSid, encontrado);
    await prisma.templateWhatsapp.upsert({
      where: { empresaId_tipo: { empresaId, tipo } },
      create: { empresaId, tipo, ...gravado },
      update: gravado,
    });
  }
}

export async function salvarTemplatesWhatsapp(
  acesso: Acesso,
  entrada: unknown,
  opcoes: OpcoesTwilioEmpresa = {},
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  await gravarTemplatesDaEmpresa(acesso.empresaId, entrada, opcoes);
  return obterPainelTelefones(acesso, opcoes.env);
}

export async function atualizarStatusTemplatesWhatsapp(
  acesso: Acesso,
  opcoes: OpcoesTwilioEmpresa = {},
): Promise<PainelTelefonesDTO> {
  exigirDono(acesso);
  const linhas = await prisma.templateWhatsapp.findMany({ where: { empresaId: acesso.empresaId } });
  const comSid = linhas.filter((linha) => contentSidValido(linha.contentSid));
  if (comSid.length === 0) {
    throw new ErroAplicacao("Não há ContentSid salvo para atualizar.", 400, "template_sem_sid");
  }
  const aprovacoes = await aprovacoesDaSubconta(acesso.empresaId, opcoes);
  for (const linha of comSid) {
    const sid = linha.contentSid ?? "";
    const encontrado = aprovacoes.get(sid);
    if (!encontrado) {
      await prisma.templateWhatsapp.update({
        where: { id: linha.id },
        data: { status: "FALHOU", motivo: "Este ContentSid não está na subconta." },
      });
      continue;
    }
    const status = statusAprovacao(encontrado.aprovacao);
    await prisma.templateWhatsapp.update({
      where: { id: linha.id },
      data: {
        status,
        motivo: status === "REJEITADO" ? (encontrado.motivo || "A Meta recusou este modelo.").slice(0, 500) : null,
      },
    });
  }
  return obterPainelTelefones(acesso, opcoes.env);
}
