import { Prisma } from "@/generated/prisma/client";
import type { EnvioReguaLista } from "@/lib/regua-progresso";
import { prisma } from "@/server/db";

type LinhaEnvio = {
  fatura_id: string;
  passo_id: string | null;
  canal: string;
  enviado_em: Date | string;
};

function isoDoEnvio(valor: Date | string): string {
  if (valor instanceof Date) return valor.toISOString();
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toISOString();
}

// Uma consulta só, das faturas já listadas na página. O e-mail fica em
// lembretes_regua e o WhatsApp em fila_whatsapp. Não lê fatura por fatura.
// O e-mail nasce já enviado, então criado_em é a hora do envio. O WhatsApp
// entra na fila antes e só depois vai para ENVIADO: atualizado_em é a hora
// que o registro tem.
export async function listarEnviosRegua(empresaId: string, faturaIds: string[]): Promise<EnvioReguaLista[]> {
  if (faturaIds.length === 0) return [];
  const linhas = await prisma.$queryRaw<LinhaEnvio[]>`
    SELECT fatura_id, passo_id, canal, criado_em AS enviado_em
    FROM lembretes_regua
    WHERE empresa_id = ${empresaId}
      AND status = 'ENVIADO'
      AND fatura_id IN (${Prisma.join(faturaIds)})
    UNION ALL
    SELECT fatura_id, passo_id, 'WHATSAPP', atualizado_em AS enviado_em
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
    criadoEm: isoDoEnvio(linha.enviado_em),
  }));
}
