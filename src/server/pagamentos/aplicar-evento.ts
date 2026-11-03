import { prisma } from "@/server/db";
import { conciliarPromessas } from "@/server/services/promessa-service";
import { enfileirarPagoWhatsapp } from "@/server/services/whatsapp-fila";
import type { EventoNormalizado, ProvedorPagamento } from "./contrato";
import { confirmarEventoAntesDaBaixa } from "./confirmar-evento";

export type ResultadoEventoComum =
  | { aplicado: true; duplicado: boolean }
  | { aplicado: false; motivo: "recusado" | "sem_cobranca" | "duplicado" };

function conflitoDeEvento(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const mensagem = "message" in erro && typeof erro.message === "string" ? erro.message : "";
  return mensagem.includes("id_evento") || mensagem.includes("idEvento");
}

/**
 * Baixa genérica, para o conector que ainda não existe. O webhook do Asaas
 * não usa esta função: ele continua no espelho que já grava boleto, Pix e cartão.
 * Se a consulta não confirmar, o evento não é consumido e um novo POST pode tentar de novo.
 */
export async function aplicarEventoDeProvedor(
  empresaId: string,
  provedor: ProvedorPagamento,
  evento: EventoNormalizado,
): Promise<ResultadoEventoComum> {
  const confirmacao = await confirmarEventoAntesDaBaixa(provedor, evento);
  if (confirmacao.recusado) return { aplicado: false, motivo: "recusado" };
  const confirmado = confirmacao.evento;
  if (confirmado.visualizacao || !confirmado.idExterno || !confirmado.status) {
    return { aplicado: false, motivo: "sem_cobranca" };
  }

  const fatura = await prisma.fatura.findFirst({
    where: { empresaId, provedor: provedor.provedor, idExterno: confirmado.idExterno },
    include: { cliente: true },
  });
  if (!fatura) return { aplicado: false, motivo: "sem_cobranca" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventoPagamento.create({
        data: {
          empresaId,
          provedor: provedor.provedor,
          idEvento: confirmado.idEvento,
          tipo: confirmado.tipo,
          idExterno: confirmado.idExterno,
          statusNormalizado: confirmado.status,
        },
      });
      await tx.fatura.update({
        where: { id: fatura.id },
        data: {
          status: confirmado.statusBruto ?? confirmado.status ?? fatura.status,
          statusNormalizado: confirmado.status ?? fatura.statusNormalizado,
          ...(confirmado.excluida || confirmado.status === "CANCELADA" ? { excluida: true } : {}),
          ...(confirmado.status === "PAGA" && confirmado.pagoEm ? { pagoEm: confirmado.pagoEm } : {}),
          ...(confirmado.status === "ESTORNADA" ? { pagoEm: null } : {}),
        },
      });
      if (confirmado.status === "PAGA" && !confirmado.excluida) {
        const regua = await tx.configuracaoRegua.findUnique({ where: { empresaId } });
        await enfileirarPagoWhatsapp(tx, fatura, regua?.modoTeste ?? true);
      }
    });
  } catch (erro) {
    if (conflitoDeEvento(erro)) return { aplicado: false, motivo: "duplicado" };
    throw erro;
  }

  await conciliarPromessas(empresaId);
  return { aplicado: true, duplicado: false };
}
