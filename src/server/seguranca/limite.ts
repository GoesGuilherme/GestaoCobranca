import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";

const DIA_MS = 24 * 60 * 60 * 1000;

export async function quantidadeNaJanela(chave: string, janelaMs: number, agora = new Date()): Promise<number> {
  const desde = new Date(agora.getTime() - janelaMs);
  return prisma.limiteTentativa.count({ where: { chave, criadoEm: { gte: desde } } });
}

export async function registrarTentativa(chave: string, agora = new Date()): Promise<void> {
  await prisma.limiteTentativa.deleteMany({
    where: { chave, criadoEm: { lt: new Date(agora.getTime() - DIA_MS) } },
  });
  await prisma.limiteTentativa.create({ data: { chave, criadoEm: agora } });
}

export async function exigirFolga(chave: string, limite: number, janelaMs: number, agora = new Date()): Promise<void> {
  const quantidade = await quantidadeNaJanela(chave, janelaMs, agora);
  if (quantidade >= limite) {
    throw new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_tentativas");
  }
}

const JANELA_LOGIN_MS = 15 * 60 * 1000;
const LIMITE_LOGIN_EMAIL = 8;

function chaveEmail(email: string) {
  return `login:email:${email.trim().toLowerCase().slice(0, 160)}`;
}

// O travamento do login é por e-mail. Um IP compartilhado não bloqueia outra pessoa
// e um x-forwarded-for forjado não escolhe a vítima.
export async function exigirLimiteLogin(email: string, agora = new Date()): Promise<void> {
  await exigirFolga(chaveEmail(email), LIMITE_LOGIN_EMAIL, JANELA_LOGIN_MS, agora);
}

export async function registrarFalhaLogin(email: string, agora = new Date()): Promise<void> {
  await registrarTentativa(chaveEmail(email), agora);
}

export async function consumirLimiteUsuario(
  usuarioId: string,
  acao: string,
  limite: number,
  janelaMs: number,
  agora = new Date(),
): Promise<void> {
  const chave = `usr:${acao}:${usuarioId}`.slice(0, 180);
  await exigirFolga(chave, limite, janelaMs, agora);
  await registrarTentativa(chave, agora);
}

const JANELA_WEBHOOK_MS = 10 * 60 * 1000;
const LIMITE_FALHA_WEBHOOK = 30;
const LIMITE_OK_EVOLUTION = 600;

function chaveWebhook(provedor: string, ip: string | null, tipo: "falha" | "ok") {
  return `webhook:${provedor}:${tipo}:${(ip ?? "sem-ip").slice(0, 64)}`;
}

export async function falhasWebhookEstouradas(
  provedor: "asaas" | "twilio" | "inter" | "evolution",
  ip: string | null,
  agora = new Date(),
): Promise<boolean> {
  const quantidade = await quantidadeNaJanela(chaveWebhook(provedor, ip, "falha"), JANELA_WEBHOOK_MS, agora);
  return quantidade >= LIMITE_FALHA_WEBHOOK;
}

export async function exigirFolgaWebhookOk(ip: string | null, agora = new Date()): Promise<void> {
  await exigirFolga(chaveWebhook("evolution", ip, "ok"), LIMITE_OK_EVOLUTION, JANELA_WEBHOOK_MS, agora);
}

export async function registrarFalhaWebhook(
  provedor: "asaas" | "twilio" | "inter" | "evolution",
  ip: string | null,
  agora = new Date(),
): Promise<void> {
  await registrarTentativa(chaveWebhook(provedor, ip, "falha"), agora);
}

export async function registrarWebhookEvolution(ip: string | null, agora = new Date()): Promise<void> {
  await registrarTentativa(chaveWebhook("evolution", ip, "ok"), agora);
}
