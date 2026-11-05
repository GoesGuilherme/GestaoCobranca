import { sessaoCompativel } from "@/lib/redefinicao-senha";
import { prisma } from "@/server/db";
import type { PrivilegioVivo } from "./privilegio-consulta";
import { verificarToken } from "./token";

export async function privilegioDoToken(token: string | null | undefined): Promise<PrivilegioVivo | null> {
  if (!token) return null;
  const sessao = await verificarToken(token);
  if (!sessao) return null;
  const usuario = await prisma.usuario.findUnique({
    where: { id: sessao.sub },
    include: { empresa: { select: { status: true } } },
  });
  if (!usuario || usuario.empresa.status !== "ATIVA") return null;
  if (!sessaoCompativel(sessao.versaoSessao ?? 0, usuario.versaoSessao)) return null;
  return { papel: usuario.papel, superadministrador: usuario.superadministrador };
}
