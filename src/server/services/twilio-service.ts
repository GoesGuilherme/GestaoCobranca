import { cifrarSegredoAsaas, decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import type { ConfiguracaoTwilioDTO, CoexistenciaTwilioDTO, TemplateWhatsappDTO } from "@/lib/tipos";
import { esquemaCodigoTwilio, esquemaConexaoTwilio } from "@/lib/validacao";
import { TEMPLATES_COBRANCA_WHATSAPP, whatsappE164 } from "@/lib/whatsapp-cobranca";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirRegua, exigirVerRegua } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { ErroTwilio, statusAprovacao, type ClienteTwilio, type CredencialTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao, credenciaisPaiTwilio, urlWebhookTwilio } from "@/server/twilio/fabrica";
import { lerEsquema } from "@/server/validar";

const whatsappVazio: ConfiguracaoTwilioDTO = {
  conectada: false,
  subaccountSid: null,
  senderTelefone: null,
  senderStatus: null,
  coexistencia: "NAO_SOLICITADA",
  nomeExibicao: "",
  wabaId: null,
  erro: null,
  tokenMascarado: null,
  templates: [],
};

function coexistenciaDe(valor: string): CoexistenciaTwilioDTO {
  if (valor === "SOLICITADA" || valor === "ATIVA" || valor === "INDISPONIVEL") return valor;
  return "NAO_SOLICITADA";
}

function paraTemplate(linha: { tipo: string; nome: string; status: string; motivo: string | null }): TemplateWhatsappDTO {
  const tipo = linha.tipo === "VENCE_EM_DIAS" || linha.tipo === "VENCEU" || linha.tipo === "PAGO" ? linha.tipo : "BOLETO_GERADO";
  return { tipo, nome: linha.nome, status: linha.status, motivo: linha.motivo };
}

export async function obterWhatsappDaEmpresa(empresaId: string): Promise<ConfiguracaoTwilioDTO> {
  const linha = await prisma.configuracaoTwilio.findUnique({ where: { empresaId } });
  if (!linha) return whatsappVazio;
  const templates = await prisma.templateWhatsapp.findMany({
    where: { empresaId },
    orderBy: { tipo: "asc" },
  });
  return {
    conectada: Boolean(linha.subaccountSid),
    subaccountSid: linha.subaccountSid,
    senderTelefone: linha.senderTelefone,
    senderStatus: linha.senderStatus,
    coexistencia: coexistenciaDe(linha.coexistencia),
    nomeExibicao: linha.nomeExibicao,
    wabaId: linha.wabaId,
    erro: linha.erro,
    tokenMascarado: `••••${linha.authTokenUltimos4.slice(-4)}`,
    templates: templates.map(paraTemplate),
  };
}

export async function obterWhatsappDoPainel(autor: AutorEmpresa) {
  exigirVerRegua(autor);
  return obterWhatsappDaEmpresa(autor.empresaId);
}

function abrirToken(cifra: string): string {
  try {
    return decifrarSegredoAsaas(cifra);
  } catch {
    throw new ErroAplicacao("O token da subconta Twilio está ilegível.", 500, "twilio_ilegivel");
  }
}

function traduzirTwilio(erro: unknown): never {
  if (erro instanceof ErroAplicacao) throw erro;
  if (erro instanceof ErroTwilio) {
    throw new ErroAplicacao(erro.message.slice(0, 240), erro.status >= 400 && erro.status < 500 ? 400 : 502, "twilio");
  }
  throw new ErroAplicacao("Falha ao falar com a Twilio.", 502, "twilio");
}

function contaDaLinha(linha: { subaccountSid: string; authTokenCifrado: string }): CredencialTwilio {
  return { accountSid: linha.subaccountSid, authToken: abrirToken(linha.authTokenCifrado) };
}

async function garantirTemplates(empresaId: string, conta: CredencialTwilio, cliente: ClienteTwilio) {
  for (const template of TEMPLATES_COBRANCA_WHATSAPP) {
    const existente = await prisma.templateWhatsapp.findUnique({
      where: { empresaId_tipo: { empresaId, tipo: template.tipo } },
    });
    if (existente?.contentSid && existente.status !== "REJEITADO" && existente.status !== "FALHOU") {
      const consulta = await cliente.consultarTemplate(conta, existente.contentSid);
      await prisma.templateWhatsapp.update({
        where: { id: existente.id },
        data: {
          status: statusAprovacao(consulta.aprovacao),
          motivo: consulta.motivo,
          categoria: "UTILITY",
        },
      });
      continue;
    }
    const publicado = await cliente.publicarTemplate(conta, {
      nome: template.nome,
      idioma: "pt_BR",
      corpo: template.corpo,
      variaveisExemplo: template.variaveisExemplo,
      categoria: "UTILITY",
    });
    const dados = {
      contentSid: publicado.sid,
      nome: template.nome,
      idioma: "pt_BR",
      categoria: "UTILITY",
      status: statusAprovacao(publicado.aprovacao),
      corpo: template.corpo,
      motivo: publicado.motivo,
    };
    await prisma.templateWhatsapp.upsert({
      where: { empresaId_tipo: { empresaId, tipo: template.tipo } },
      create: { empresaId, tipo: template.tipo, ...dados },
      update: dados,
    });
  }
}

export async function conectarTwilio(
  autor: AutorEmpresa,
  entrada: unknown,
  opcoes: { twilio?: ClienteTwilio } = {},
) {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaConexaoTwilio, entrada);
  const telefone = whatsappE164(dados.telefone);
  if (!telefone) {
    throw new ErroAplicacao("Informe um WhatsApp válido com DDD.", 400, "whatsapp_invalido");
  }
  const nome = dados.nomeExibicao.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const wabaId = dados.wabaId.trim() || null;
  const pai = credenciaisPaiTwilio();
  const webhookUrl = urlWebhookTwilio();
  const cliente = opcoes.twilio ?? clienteTwilioPadrao();
  const anterior = await prisma.configuracaoTwilio.findUnique({ where: { empresaId: autor.empresaId } });

  let subaccountSid = anterior?.subaccountSid ?? "";
  let authToken = "";
  if (anterior) {
    authToken = abrirToken(anterior.authTokenCifrado);
  } else {
    let criada: { sid: string; authToken: string };
    try {
      criada = await cliente.criarSubconta(pai, `Taguaro ${autor.empresaId}`.slice(0, 64));
    } catch (erro) {
      traduzirTwilio(erro);
    }
    subaccountSid = criada.sid;
    authToken = criada.authToken;
    const cifra = cifrarSegredoAsaas(authToken);
    await prisma.configuracaoTwilio.create({
      data: {
        empresaId: autor.empresaId,
        subaccountSid,
        authTokenCifrado: cifra,
        authTokenUltimos4: authToken.slice(-4),
        senderStatus: "AUSENTE",
        nomeExibicao: nome,
        wabaId,
        coexistencia: dados.coexistencia ? "SOLICITADA" : "NAO_SOLICITADA",
        webhookUrl,
      },
    });
  }

  const conta = { accountSid: subaccountSid, authToken };
  try {
    const sender =
      anterior?.senderSid && anterior.senderTelefone === telefone
        ? await cliente.obterSender(conta, anterior.senderSid)
        : await cliente.criarSender(conta, {
            telefoneE164: telefone,
            nome,
            wabaId,
            webhookUrl,
            pedirCoexistencia: dados.coexistencia,
          });
    const coexistencia = !dados.coexistencia
      ? "NAO_SOLICITADA"
      : sender.coexistencia === "ATIVA"
        ? "ATIVA"
        : sender.coexistencia === "INDISPONIVEL"
          ? "INDISPONIVEL"
          : "SOLICITADA";
    await prisma.configuracaoTwilio.update({
      where: { empresaId: autor.empresaId },
      data: {
        senderSid: sender.sid,
        senderTelefone: telefone,
        senderStatus: sender.status.slice(0, 40),
        nomeExibicao: nome,
        wabaId,
        coexistencia,
        webhookUrl,
        erro:
          coexistencia === "SOLICITADA"
            ? "A Senders API v2 não devolveu um campo de coexistência. O Sender foi registrado do jeito oficial. Se a conta Twilio tiver coexistência com o app WhatsApp Business, conclua no console e atualize o status."
            : null,
      },
    });
    await garantirTemplates(autor.empresaId, conta, cliente);
  } catch (erro) {
    if (erro instanceof ErroTwilio && erro.codigo === 63110) {
      await prisma.configuracaoTwilio.update({
        where: { empresaId: autor.empresaId },
        data: {
          senderTelefone: telefone,
          senderStatus: "FALHOU",
          nomeExibicao: nome,
          wabaId,
          webhookUrl,
          coexistencia: "INDISPONIVEL",
          erro: "A Senders API não oferece coexistência para este número (erro 63110): ele já está no WhatsApp. Não chamamos a Meta. Libere o número na Twilio ou conclua a coexistência no console, se a conta tiver esse recurso, e tente de novo.",
        },
      });
      return obterWhatsappDaEmpresa(autor.empresaId);
    }
    const mensagem = erro instanceof ErroTwilio ? erro.message : erro instanceof ErroAplicacao ? erro.message : "Falha ao falar com a Twilio.";
    await prisma.configuracaoTwilio.update({
      where: { empresaId: autor.empresaId },
      data: { erro: mensagem.slice(0, 240), nomeExibicao: nome, wabaId, webhookUrl },
    });
    if (erro instanceof ErroAplicacao) throw erro;
    traduzirTwilio(erro);
  }

  const atual = await prisma.configuracaoTwilio.findUniqueOrThrow({ where: { empresaId: autor.empresaId } });
  if (atual.senderSid) {
    await prisma.configuracaoTwilio.update({
      where: { empresaId: autor.empresaId },
      data: { erro: atual.coexistencia === "SOLICITADA" ? atual.erro : null },
    });
  }
  return obterWhatsappDaEmpresa(autor.empresaId);
}

export async function confirmarCodigoTwilio(
  autor: AutorEmpresa,
  entrada: unknown,
  opcoes: { twilio?: ClienteTwilio } = {},
) {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaCodigoTwilio, entrada);
  const linha = await prisma.configuracaoTwilio.findUnique({ where: { empresaId: autor.empresaId } });
  if (!linha?.senderSid) {
    throw new ErroAplicacao("Conecte o WhatsApp antes de informar o código.", 400, "twilio_sem_sender");
  }
  const cliente = opcoes.twilio ?? clienteTwilioPadrao();
  try {
    const sender = await cliente.enviarCodigo(contaDaLinha(linha), linha.senderSid, dados.codigo);
    await prisma.configuracaoTwilio.update({
      where: { empresaId: autor.empresaId },
      data: {
        senderStatus: sender.status.slice(0, 40),
        erro: null,
        coexistencia:
          sender.coexistencia === "ATIVA"
            ? "ATIVA"
            : sender.coexistencia === "INDISPONIVEL"
              ? "INDISPONIVEL"
              : linha.coexistencia,
      },
    });
  } catch (erro) {
    traduzirTwilio(erro);
  }
  return obterWhatsappDaEmpresa(autor.empresaId);
}

export async function atualizarTwilio(autor: AutorEmpresa, opcoes: { twilio?: ClienteTwilio } = {}) {
  exigirRegua(autor);
  const linha = await prisma.configuracaoTwilio.findUnique({ where: { empresaId: autor.empresaId } });
  if (!linha) {
    throw new ErroAplicacao("Esta empresa ainda não tem WhatsApp na Twilio.", 400, "twilio_sem_sender");
  }
  const cliente = opcoes.twilio ?? clienteTwilioPadrao();
  const conta = contaDaLinha(linha);
  try {
    if (linha.senderSid) {
      const sender = await cliente.obterSender(conta, linha.senderSid);
      await prisma.configuracaoTwilio.update({
        where: { empresaId: autor.empresaId },
        data: {
          senderStatus: sender.status.slice(0, 40),
          coexistencia:
            sender.coexistencia === "ATIVA"
              ? "ATIVA"
              : sender.coexistencia === "INDISPONIVEL"
                ? "INDISPONIVEL"
                : linha.coexistencia,
          erro: sender.status === "ONLINE" && linha.coexistencia !== "SOLICITADA" ? null : linha.erro,
        },
      });
    }
    await garantirTemplates(autor.empresaId, conta, cliente);
  } catch (erro) {
    traduzirTwilio(erro);
  }
  return obterWhatsappDaEmpresa(autor.empresaId);
}
