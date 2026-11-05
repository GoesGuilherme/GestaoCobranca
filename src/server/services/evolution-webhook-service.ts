import { decisaoOptOut, digitosWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { evolutionLigada, segredoWebhookEvolution } from "@/server/evolution/fabrica";
import {
  exigirFolgaWebhookOk,
  falhasWebhookEstouradas,
  registrarFalhaWebhook,
  registrarWebhookEvolution,
} from "@/server/seguranca/limite";
import { instanciaEvolutionValida } from "@/server/whatsapp/selecao";
import { timingSafeEqual } from "node:crypto";
import { abrirAlerta, resolverAlerta } from "./alerta-empresa";

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

function eventoDe(corpo: Record<string, unknown>): string {
  return (texto(corpo.event, 80) ?? "").toLowerCase().replace(/[._\s-]/g, "");
}

function instanteDe(valor: unknown): Date | null {
  const bruto = texto(valor, 40);
  if (!bruto) return null;
  const data = new Date(bruto);
  if (Number.isNaN(data.getTime())) return null;
  return data;
}

function estadoDe(valor: unknown): "CONECTADO" | "CONECTANDO" | "DESCONECTADO" | null {
  const textoEstado = (texto(valor, 40) ?? "").toLowerCase();
  if (textoEstado === "open" || textoEstado === "connected") return "CONECTADO";
  if (textoEstado === "connecting" || textoEstado === "qrcode") return "CONECTANDO";
  if (textoEstado === "close" || textoEstado === "closed") return "DESCONECTADO";
  return null;
}

function telefoneDe(valor: unknown): string | null {
  const bruto = texto(valor, 80) ?? "";
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos;
}

function statusMensagem(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isInteger(valor)) {
    const mapa = ["ERROR", "PENDING", "SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED"];
    return mapa[valor] ?? null;
  }
  const textoStatus = (texto(valor, 40) ?? "").toUpperCase();
  if (!textoStatus || textoStatus.length > 40) return null;
  if (!/^[A-Z0-9_-]+$/.test(textoStatus)) return null;
  return textoStatus;
}

function idMensagem(dados: Record<string, unknown>): string | null {
  const chave = objeto(dados.key);
  const id = texto(dados.keyId, 128) ?? texto(chave?.id, 128) ?? texto(dados.id, 128);
  if (!id || !/^[A-Za-z0-9._:-]{6,128}$/.test(id)) return null;
  return id;
}

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

export async function processarWebhookEvolution(dados: {
  segredo: string | null;
  corpo: unknown;
  ip: string | null;
  agora?: Date;
}) {
  const agora = dados.agora ?? new Date();
  if (!evolutionLigada()) {
    throw new ErroAplicacao("Webhook recusado.", 404, "evolution_desligada");
  }
  let esperado = "";
  try {
    esperado = segredoWebhookEvolution();
  } catch {
    throw new ErroAplicacao("Webhook recusado.", 403, "evolution_assinatura");
  }
  const recebido = dados.segredo?.trim() ?? "";
  if (!segredoConfere(recebido, esperado)) {
    if (await falhasWebhookEstouradas("evolution", dados.ip, agora)) {
      throw new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_tentativas");
    }
    await registrarFalhaWebhook("evolution", dados.ip, agora);
    throw new ErroAplicacao("Webhook recusado.", 403, "evolution_assinatura");
  }
  await exigirFolgaWebhookOk(dados.ip, agora);
  await registrarWebhookEvolution(dados.ip, agora);

  const corpo = objeto(dados.corpo);
  if (!corpo) throw new ErroAplicacao("Evento inválido.", 400, "evolution_invalido");
  const nome = texto(corpo.instance, 48) ?? "";
  if (!instanciaEvolutionValida(nome)) return { recebido: true, ignorado: true };
  const config = await prisma.configuracaoCanalWhatsapp.findUnique({ where: { instanceName: nome } });
  if (!config) return { recebido: true, ignorado: true };

  const evento = eventoDe(corpo);
  const brutoData = Array.isArray(corpo.data) ? corpo.data.slice(0, 20) : [corpo.data];
  const data = objeto(brutoData[0]) ?? {};
  const quando = instanteDe(corpo.date_time) ?? instanteDe(corpo.dateTime) ?? instanteDe(data.date_time);

  if (evento === "connectionupdate" || evento === "qrcodeupdated") {
    if (quando && config.ultimoEventoEm && quando.getTime() < config.ultimoEventoEm.getTime()) {
      return { recebido: true, ignorado: true };
    }
    const estado = evento === "qrcodeupdated" ? "CONECTANDO" : estadoDe(data.state ?? data.status ?? corpo.state);
    if (!estado) return { recebido: true, ignorado: true };
    if (!quando && config.statusConexao === "CONECTADO" && estado !== "CONECTADO") {
      return { recebido: true, ignorado: true };
    }
    const telefone = telefoneDe(data.wuid) ?? telefoneDe(corpo.sender);
    await prisma.configuracaoCanalWhatsapp.update({
      where: { id: config.id },
      data: {
        statusConexao: estado,
        ultimoEventoEm: quando ?? agora,
        ...(telefone ? { telefone } : {}),
        erro: null,
      },
    });
    if (estado === "CONECTADO") await resolverAlerta(config.empresaId, "WHATSAPP_DESCONECTADO");
    if (estado === "DESCONECTADO") await abrirAlerta(config.empresaId, "WHATSAPP_DESCONECTADO");
    return { recebido: true, ignorado: false };
  }

  if (evento === "messagesupdate") {
    const id = idMensagem(data);
    const status = statusMensagem(objeto(data.update)?.status ?? data.status);
    if (!id || !status) return { recebido: true, ignorado: true };
    const fila = await prisma.filaWhatsapp.findFirst({
      where: { empresaId: config.empresaId, messageSid: id },
    });
    try {
      await prisma.eventoWhatsapp.create({
        data: {
          empresaId: config.empresaId,
          filaId: fila?.id,
          messageSid: id,
          tipo: "STATUS",
          status: status.slice(0, 40),
        },
      });
    } catch (erro) {
      if (conflito(erro)) return { recebido: true, duplicado: true };
      throw erro;
    }
    if (fila && (status === "ERROR" || status === "FAILED")) {
      await prisma.filaWhatsapp.update({
        where: { id: fila.id },
        data: { status: "FALHOU", motivo: "A Evolution não entregou a mensagem." },
      });
      await abrirAlerta(config.empresaId, "WHATSAPP_FALHA_ENVIO");
    }
    return { recebido: true, duplicado: false };
  }

  if (evento === "messagesupsert") {
    const chave = objeto(data.key);
    if (chave?.fromMe === true) return { recebido: true, ignorado: true };
    const id = idMensagem(data);
    const mensagem = objeto(data.message);
    const corpoMensagem =
      texto(mensagem?.conversation, 500) ??
      texto(objeto(mensagem?.extendedTextMessage)?.text, 500);
    const digitos = digitosWhatsapp(texto(chave?.remoteJid, 80) ?? "");
    const decisao = decisaoOptOut({ corpo: corpoMensagem ?? "", optOutType: "" });
    if (!id) return { recebido: true, ignorado: true };
    try {
      await prisma.eventoWhatsapp.create({
        data: {
          empresaId: config.empresaId,
          messageSid: id,
          tipo: "INBOUND",
          status: decisao ?? "RECEBIDA",
          de: digitos,
          corpo: corpoMensagem,
        },
      });
    } catch (erro) {
      if (conflito(erro)) return { recebido: true, duplicado: true };
      throw erro;
    }
    if (digitos && decisao) {
      await prisma.optOutWhatsapp.upsert({
        where: { empresaId_telefone: { empresaId: config.empresaId, telefone: digitos } },
        create: { empresaId: config.empresaId, telefone: digitos, ativo: decisao === "PARAR", origem: "INBOUND" },
        update: { ativo: decisao === "PARAR", origem: "INBOUND" },
      });
    }
    return { recebido: true, ignorado: false };
  }

  return { recebido: true, ignorado: true };
}
