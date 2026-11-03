import { Prisma } from "@/generated/prisma/client";
import { hashTokenWebhook, tokensWebhookIguais } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { confirmarEventoParaBaixa } from "@/server/pagamentos/baixa";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import { normalizarWebhookInter } from "@/server/pagamentos/webhook-inter";
import { gravarCobrancaInter } from "./inter-cobranca";
import { conciliarPromessas } from "./promessa-service";

function brutoJson(valor: unknown): Prisma.InputJsonValue | undefined {
  try {
    return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function conflitoDeEvento(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const mensagem = "message" in erro && typeof erro.message === "string" ? erro.message : "";
  return mensagem.includes("id_evento_externo") || mensagem.includes("idEventoExterno");
}

function consultaFalhou(consultou: boolean, statusIgual: boolean, baixar: boolean) {
  return consultou && !baixar && statusIgual;
}

export async function processarWebhookInter(segredo: string, corpo: unknown, clienteHttp?: ClienteHttpInter) {
  const recebido = segredo.trim();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(recebido)) {
    throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");
  }
  const hash = hashTokenWebhook(recebido);
  const config = await prisma.configuracaoPagamento.findUnique({ where: { segredoWebhookHash: hash } });
  if (!config || config.provedor !== "INTER" || !config.ativo || !config.segredoWebhookHash || !tokensWebhookIguais(recebido, config.segredoWebhookHash)) {
    throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");
  }

  const eventos = normalizarWebhookInter(corpo);
  if (eventos.length === 0) {
    throw new ErroAplicacao("Evento do Inter inválido.", 400, "webhook_invalido");
  }

  const provedor = await provedorDaEmpresa(config.empresaId, undefined, clienteHttp);
  let mudou = false;
  for (const evento of eventos) {
    const confirmado = await confirmarEventoParaBaixa(provedor, evento);
    const statusIgual = confirmado.evento.status === evento.status;
    if (evento.alteraCobranca && consultaFalhou(confirmado.consultou, statusIgual, confirmado.baixar)) {
      throw new ErroAplicacao(
        "Não foi possível confirmar a cobrança no Inter. O aviso será tentado de novo.",
        503,
        "webhook_indisponivel",
      );
    }
    if (!confirmado.baixar) continue;

    let cobranca = null;
    if (evento.alteraCobranca && evento.idExterno) {
      try {
        cobranca = await provedor.consultarCobranca(evento.idExterno);
      } catch {
        throw new ErroAplicacao(
          "Não foi possível confirmar a cobrança no Inter. O aviso será tentado de novo.",
          503,
          "webhook_indisponivel",
        );
      }
      if (cobranca.status !== evento.status) continue;
    }

    try {
      await prisma.eventoPagamento.create({
        data: {
          empresaId: config.empresaId,
          provedor: "INTER",
          idEventoExterno: evento.idEvento,
          idExterno: evento.idExterno,
          tipo: evento.tipo,
          statusNormalizado: confirmado.evento.status,
          bruto: brutoJson(evento.bruto),
        },
      });
    } catch (erro) {
      if (conflitoDeEvento(erro)) continue;
      throw erro;
    }

    if (!cobranca || !evento.idExterno) continue;
    const fatura = await prisma.fatura.findFirst({
      where: { empresaId: config.empresaId, provedor: "INTER", idExterno: evento.idExterno },
      select: { id: true },
    });
    if (!fatura) continue;
    await gravarCobrancaInter(config.empresaId, fatura.id, cobranca);
    mudou = true;
  }
  if (mudou) await conciliarPromessas(config.empresaId);
  return { ok: true as const };
}
