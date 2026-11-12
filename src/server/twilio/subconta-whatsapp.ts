import { contentSidValido, resolverWhatsappDoPasso, TIPOS_TEMPLATE_WHATSAPP, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { CredencialTwilio } from "@/server/twilio/contrato";
import { remetenteDaEmpresa, type DbRemetente } from "@/server/twilio/remetente";

type DbModelo = DbRemetente & Pick<Prisma.TransactionClient, "templateWhatsapp">;

export type DecisaoSubcontaWhatsapp =
  | {
      usar: true;
      motivo: null;
      conta: CredencialTwilio;
      de: string;
      contentSid: string;
      statusCallback: string;
    }
  | { usar: false; motivo: string | null };

function tipoConhecido(tipo: string): tipo is TipoTemplateWhatsapp {
  return TIPOS_TEMPLATE_WHATSAPP.includes(tipo as TipoTemplateWhatsapp);
}

async function sidAprovado(empresaId: string, tipo: string, db: DbModelo): Promise<string | null> {
  if (!tipoConhecido(tipo)) return null;
  const linha = await db.templateWhatsapp.findUnique({
    where: { empresaId_tipo: { empresaId, tipo } },
  });
  if (!linha || linha.status !== "APROVADO") return null;
  return contentSidValido(linha.contentSid);
}

// Subconta configurada, número padrão ativo e modelo aprovado deste tipo.
// Sem a subconta, devolve null e o chamador segue o caminho de hoje.
export async function contentSidAprovadoDaEmpresa(
  empresaId: string,
  tipo: string,
  env: NodeJS.ProcessEnv = process.env,
  db: DbModelo = prisma,
): Promise<string | null> {
  const remetente = await remetenteDaEmpresa(empresaId, "WHATSAPP", env, db);
  if (!remetente) return null;
  return sidAprovado(empresaId, tipo, db);
}

export function motivoSemModeloAprovado(tipo: string): string {
  return `Subconta sem modelo aprovado (${tipo}).`;
}

// Não inclui token, SID de conteúdo nem telefone. O motivo fica na fila.
export function registrarFallbackSubconta(empresaId: string, tipo: string, motivo: string) {
  console.info(JSON.stringify({ evento: "whatsapp_fallback_subconta", empresaId, tipo, motivo }));
}

export async function decidirSubcontaWhatsapp(
  empresaId: string,
  tipo: string,
  env: NodeJS.ProcessEnv = process.env,
  db: DbModelo = prisma,
): Promise<DecisaoSubcontaWhatsapp> {
  const remetente = await remetenteDaEmpresa(empresaId, "WHATSAPP", env, db);
  if (!remetente) return { usar: false, motivo: null };
  const contentSid = await sidAprovado(empresaId, tipo, db);
  if (!contentSid) return { usar: false, motivo: motivoSemModeloAprovado(tipo) };
  return {
    usar: true,
    motivo: null,
    conta: remetente.conta,
    de: remetente.de,
    contentSid,
    statusCallback: remetente.statusCallback,
  };
}

// O passo com dias === 0 usa VENCE_HOJE só com modelo aprovado na subconta.
// Nos outros casos devolve o tipo de hoje, inclusive VENCE_EM_DIAS.
export async function tipoWhatsappDoPasso(
  empresaId: string,
  passo: { naEmissao: boolean; dias: number | null },
  cobranca: { formaCobranca?: string | null; vencimento?: Date | string | null } | null,
  agora = new Date(),
  env: NodeJS.ProcessEnv = process.env,
  db: DbModelo = prisma,
): Promise<{ tipo: TipoTemplateWhatsapp; dias: number | null } | null> {
  const resolvido = resolverWhatsappDoPasso(passo, cobranca, agora);
  if (!resolvido) return null;
  if (passo.naEmissao || passo.dias !== 0 || resolvido.tipo !== "VENCE_EM_DIAS") return resolvido;
  const contentSid = await contentSidAprovadoDaEmpresa(empresaId, "VENCE_HOJE", env, db);
  if (!contentSid) return resolvido;
  return { tipo: "VENCE_HOJE", dias: 0 };
}
