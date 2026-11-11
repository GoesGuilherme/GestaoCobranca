import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { caminhoLogoPublica, urlPublicaLogo, validarLogo, type ResumoLogo } from "@/lib/logo";

export type { ResumoLogo };

function resumoDe(empresaId: string, atualizadoEm: Date | null): ResumoLogo {
  if (!atualizadoEm) return { temLogo: false, atualizadoEm: null, caminho: null };
  const versao = atualizadoEm.toISOString();
  return { temLogo: true, atualizadoEm: versao, caminho: caminhoLogoPublica(empresaId, versao) };
}

export async function resumoLogoEmpresa(empresaId: string): Promise<ResumoLogo> {
  const logo = await prisma.logoEmpresa.findUnique({
    where: { empresaId },
    select: { atualizadoEm: true },
  });
  return resumoDe(empresaId, logo?.atualizadoEm ?? null);
}

export async function urlLogoParaEmail(empresaId: string): Promise<string | null> {
  const logo = await prisma.logoEmpresa.findUnique({
    where: { empresaId },
    select: { atualizadoEm: true },
  });
  if (!logo) return null;
  return urlPublicaLogo(empresaId, logo.atualizadoEm.toISOString());
}

export async function gravarLogoEmpresa(acesso: Acesso, bytes: Uint8Array): Promise<ResumoLogo> {
  exigirDono(acesso);
  const validado = validarLogo(bytes);
  if (!validado.ok) throw new ErroAplicacao(validado.erro, 400, "logo_invalida");

  const logo = await prisma.logoEmpresa.upsert({
    where: { empresaId: acesso.empresaId },
    create: {
      empresaId: acesso.empresaId,
      conteudo: Buffer.from(bytes),
      mime: validado.mime,
    },
    update: {
      conteudo: Buffer.from(bytes),
      mime: validado.mime,
    },
    select: { atualizadoEm: true },
  });
  return resumoDe(acesso.empresaId, logo.atualizadoEm);
}

export async function removerLogoEmpresa(acesso: Acesso): Promise<ResumoLogo> {
  exigirDono(acesso);
  await prisma.logoEmpresa.deleteMany({ where: { empresaId: acesso.empresaId } });
  return resumoDe(acesso.empresaId, null);
}

export async function lerLogoPublica(empresaId: string): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | null> {
  const logo = await prisma.logoEmpresa.findUnique({
    where: { empresaId },
    select: { conteudo: true, mime: true },
  });
  if (!logo) return null;
  const bytes = new Uint8Array(logo.conteudo);
  const validado = validarLogo(bytes);
  if (!validado.ok || validado.mime !== logo.mime) return null;
  return { bytes, mime: validado.mime };
}
