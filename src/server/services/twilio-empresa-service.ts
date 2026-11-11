import { decifrarSegredoAsaas, cifrarSegredoAsaas } from "@/lib/asaas-cripto";
import {
  canalTwilio,
  criacaoSubcontaHabilitada,
  normalizarTelefoneTwilio,
  rotuloCanalTwilio,
  rotuloStatusNumeroTwilio,
  rotuloStatusSubconta,
  statusNumeroTwilio,
  type CanalTwilioEmpresa,
  type StatusNumeroTwilio,
} from "@/lib/twilio-empresa";
import type { NumeroTwilioDTO, PainelTelefonesDTO } from "@/lib/tipos";
import { esquemaNumeroTwilio, esquemaStatusNumeroTwilio } from "@/lib/validacao";
import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ClienteTwilio } from "@/server/twilio/contrato";
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
  const [subconta, numeros, whatsapp, sms] = await Promise.all([
    prisma.subcontaTwilio.findUnique({ where: { empresaId: acesso.empresaId } }),
    prisma.numeroTwilioEmpresa.findMany({
      where: { empresaId: acesso.empresaId },
      orderBy: [{ canal: "asc" }, { criadoEm: "asc" }],
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
