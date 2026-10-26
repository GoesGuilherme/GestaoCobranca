import type { LembreteReguaDTO, StatusLembrete } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { redigirSegredoResend, type ClienteResend } from "./resend";

function statusDe(valor: string): StatusLembrete {
  if (valor === "ENVIADO" || valor === "FALHOU" || valor === "IGNORADO") return valor;
  return "FALHOU";
}

export function paraLembrete(lembrete: {
  id: string;
  passoId: string | null;
  canal: string;
  status: string;
  motivo: string | null;
  destino: string | null;
  automatico: boolean;
  modoTeste: boolean;
  rotulo: string;
  criadoEm: Date;
}): LembreteReguaDTO {
  return {
    id: lembrete.id,
    passoId: lembrete.passoId,
    canal: lembrete.canal,
    status: statusDe(lembrete.status),
    motivo: lembrete.motivo,
    destino: lembrete.destino,
    automatico: lembrete.automatico,
    modoTeste: lembrete.modoTeste,
    rotulo: lembrete.rotulo,
    criadoEm: lembrete.criadoEm.toISOString(),
  };
}

function ehConflitoUnico(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

export function textoErroEnvio(erro: unknown): string {
  const bruto = erro instanceof ErroAplicacao ? erro.message : erro instanceof Error ? erro.message : "Falha ao enviar.";
  return redigirSegredoResend(bruto).slice(0, 180);
}

export async function registrarIgnorado(dados: {
  empresaId: string;
  faturaId: string;
  clienteId: string;
  passoId: string | null;
  modoTeste: boolean;
  rotulo: string;
  motivo: string;
}): Promise<boolean> {
  try {
    await prisma.lembreteRegua.create({
      data: {
        empresaId: dados.empresaId,
        faturaId: dados.faturaId,
        clienteId: dados.clienteId,
        passoId: dados.passoId,
        canal: "EMAIL",
        status: "IGNORADO",
        motivo: dados.motivo,
        destino: null,
        automatico: true,
        modoTeste: dados.modoTeste,
        rotulo: dados.rotulo,
      },
    });
    return true;
  } catch (erro) {
    if (ehConflitoUnico(erro)) return false;
    throw erro;
  }
}

export async function dispararLembrete(dados: {
  empresaId: string;
  faturaId: string;
  clienteId: string;
  passoId: string | null;
  rotulo: string;
  automatico: boolean;
  modoTeste: boolean;
  destino: string;
  assunto: string;
  texto: string;
  de: string;
  replyTo: string | null;
  chave: string;
  resend: ClienteResend;
}): Promise<{ lembrete: LembreteReguaDTO; repetido: boolean }> {
  if (dados.automatico && dados.passoId) {
    const jaEnviado = await prisma.lembreteRegua.findFirst({
      where: {
        faturaId: dados.faturaId,
        passoId: dados.passoId,
        automatico: true,
        status: "ENVIADO",
      },
    });
    if (jaEnviado) return { lembrete: paraLembrete(jaEnviado), repetido: true };
  }

  try {
    await dados.resend.enviar({
      chave: dados.chave,
      de: dados.de,
      para: dados.destino,
      assunto: dados.assunto,
      texto: dados.texto,
      replyTo: dados.replyTo,
    });
  } catch (erro) {
    const motivo = textoErroEnvio(erro);
    const falha = await prisma.lembreteRegua.create({
      data: {
        empresaId: dados.empresaId,
        faturaId: dados.faturaId,
        clienteId: dados.clienteId,
        passoId: dados.passoId,
        canal: "EMAIL",
        status: "FALHOU",
        motivo,
        destino: dados.destino,
        automatico: dados.automatico,
        modoTeste: dados.modoTeste,
        rotulo: dados.rotulo,
      },
    });
    if (dados.automatico) return { lembrete: paraLembrete(falha), repetido: false };
    throw new ErroAplicacao(motivo, 502, "resend");
  }

  try {
    const lembrete = await prisma.lembreteRegua.create({
      data: {
        empresaId: dados.empresaId,
        faturaId: dados.faturaId,
        clienteId: dados.clienteId,
        passoId: dados.passoId,
        canal: "EMAIL",
        status: "ENVIADO",
        motivo: null,
        destino: dados.destino,
        automatico: dados.automatico,
        modoTeste: dados.modoTeste,
        rotulo: dados.rotulo,
      },
    });
    return { lembrete: paraLembrete(lembrete), repetido: false };
  } catch (erro) {
    if (ehConflitoUnico(erro) && dados.automatico) {
      const existente = await prisma.lembreteRegua.findFirst({
        where: { faturaId: dados.faturaId, passoId: dados.passoId, automatico: true, status: "ENVIADO" },
      });
      if (existente) return { lembrete: paraLembrete(existente), repetido: true };
    }
    throw erro;
  }
}
