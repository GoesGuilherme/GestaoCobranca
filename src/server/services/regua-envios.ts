import { Prisma } from "@/generated/prisma/client";
import type { EnvioReguaLista } from "@/lib/regua-progresso";
import { prisma } from "@/server/db";

type LinhaEnvio = {
  fatura_id: string;
  passo_id: string | null;
  canal: string;
};

// Uma consulta só, das faturas já listadas na página. O e-mail fica em
// lembretes_regua e o WhatsApp em fila_whatsapp. Não lê fatura por fatura.
export async function listarEnviosRegua(empresaId: string, faturaIds: string[]): Promise<EnvioReguaLista[]> {
  if (faturaIds.length === 0) return [];
  const linhas = await prisma.$queryRaw<LinhaEnvio[]>`
    SELECT fatura_id, passo_id, canal
    FROM lembretes_regua
    WHERE empresa_id = ${empresaId}
      AND status = 'ENVIADO'
      AND fatura_id IN (${Prisma.join(faturaIds)})
    UNION ALL
    SELECT fatura_id, passo_id, 'WHATSAPP'
    FROM fila_whatsapp
    WHERE empresa_id = ${empresaId}
      AND status = 'ENVIADO'
      AND fatura_id IN (${Prisma.join(faturaIds)})
  `;
  return linhas.map((linha) => ({
    faturaId: linha.fatura_id,
    passoId: linha.passo_id,
    canal: linha.canal,
    status: "ENVIADO",
  }));
}
