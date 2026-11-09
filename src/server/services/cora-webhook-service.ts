import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { abrirClienteCora } from "@/server/cora/abrir";
import { logCora, logCoraErro } from "@/server/cora/log";
import { segredoWebhookCora } from "@/server/cora/ambiente";
import { deFaturaCora } from "@/server/pagamentos/adaptador-cora";
import { agenteWebhookCora, lerAvisoCora } from "@/server/pagamentos/webhook-cora";
import { gravarCobrancaCora } from "./cora-cobranca";
import { conciliarPromessas } from "./promessa-service";

const JANELA_MS = 60_000;
const LIMITE = 60;
const hits = new Map<string, number[]>();

export function limparLimiteWebhookCora() {
  hits.clear();
}

export function limitarWebhookCora(ip: string, agora = Date.now()): boolean {
  if (hits.size > 5_000) hits.clear();
  const janela = agora - JANELA_MS;
  const lista = (hits.get(ip) ?? []).filter((item) => item > janela);
  if (lista.length >= LIMITE) {
    hits.set(ip, lista);
    return false;
  }
  lista.push(agora);
  hits.set(ip, lista);
  return true;
}

function segredoConfere(recebido: string): boolean {
  const esperado = segredoWebhookCora();
  if (!esperado || !/^[A-Za-z0-9_-]{20,80}$/.test(recebido)) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function conflitoDeEvento(erro: unknown) {
  if (typeof erro !== "object" || erro === null || !("code" in erro) || erro.code !== "P2002") return false;
  const mensagem = "message" in erro && typeof erro.message === "string" ? erro.message : "";
  return mensagem.includes("id_evento_externo") || mensagem.includes("idEventoExterno");
}

function brutoJson(valor: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

// O aviso da Cora não traz o status e não é assinado. A baixa usa só a fatura
// relida com o token da empresa dona da cobrança.
export async function processarWebhookCora(
  segredo: string,
  headers: Headers,
  opcoes: { ip?: string | null; clienteDe?: (empresaId: string) => Promise<ClienteHttpCora> } = {},
) {
  if (!segredoConfere(segredo)) {
    throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");
  }
  if (!agenteWebhookCora(headers)) {
    throw new ErroAplicacao("Webhook recusado.", 401, "webhook_recusado");
  }
  const ip = opcoes.ip ?? "desconhecido";
  if (!limitarWebhookCora(ip)) {
    throw new ErroAplicacao("Muitos avisos. Tente de novo daqui a pouco.", 429, "webhook_limite");
  }
  const aviso = lerAvisoCora(headers);
  if (!aviso) {
    throw new ErroAplicacao("Aviso da Cora inválido.", 400, "webhook_invalido");
  }

  const faturas = await prisma.fatura.findMany({
    where: { provedor: "CORA", idExterno: aviso.idExterno },
    select: { id: true, empresaId: true },
    take: 2,
  });
  if (faturas.length !== 1) {
    logCora("aviso sem fatura única", { tipo: aviso.tipo, quantidade: faturas.length });
    return { ok: true as const };
  }
  const fatura = faturas[0];
  const ja = await prisma.eventoPagamento.findFirst({
    where: { empresaId: fatura.empresaId, provedor: "CORA", idEventoExterno: aviso.idEvento },
    select: { id: true },
  });
  if (ja) return { ok: true as const };

  let cliente: ClienteHttpCora;
  try {
    cliente = opcoes.clienteDe ? await opcoes.clienteDe(fatura.empresaId) : await abrirClienteCora(fatura.empresaId);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && (erro.codigo === "cora_sem_conexao" || erro.codigo === "cora_reconectar")) {
      logCoraErro("aviso sem conexão", { empresaId: fatura.empresaId, codigo: erro.codigo });
      return { ok: true as const };
    }
    throw new ErroAplicacao("Não foi possível confirmar a fatura na Cora. O aviso será tentado de novo.", 503, "webhook_indisponivel");
  }

  let cobranca;
  try {
    cobranca = deFaturaCora(await cliente.consultarFatura(aviso.idExterno));
  } catch (erro) {
    const codigo = erro instanceof ErroAplicacao ? erro.codigo : "erro";
    if (codigo === "cora_sem_conexao" || codigo === "cora_reconectar") {
      logCoraErro("aviso sem conexão", { empresaId: fatura.empresaId, codigo });
      return { ok: true as const };
    }
    logCoraErro("falha ao reler fatura", { empresaId: fatura.empresaId, faturaId: fatura.id, codigo });
    throw new ErroAplicacao("Não foi possível confirmar a fatura na Cora. O aviso será tentado de novo.", 503, "webhook_indisponivel");
  }

  await gravarCobrancaCora(fatura.empresaId, fatura.id, cobranca);
  try {
    await prisma.eventoPagamento.create({
      data: {
        empresaId: fatura.empresaId,
        provedor: "CORA",
        idEventoExterno: aviso.idEvento,
        idExterno: aviso.idExterno,
        tipo: aviso.tipo,
        statusNormalizado: cobranca.status,
        bruto: brutoJson({ tipo: aviso.tipo, idExterno: aviso.idExterno, status: cobranca.statusBruto }),
      },
    });
  } catch (erro) {
    if (!conflitoDeEvento(erro)) throw erro;
  }
  await conciliarPromessas(fatura.empresaId);
  return { ok: true as const };
}
