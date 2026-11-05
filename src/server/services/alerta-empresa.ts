import type { AlertaEmpresaDTO } from "@/lib/tipos";
import { prisma } from "@/server/db";

export type CodigoAlerta = "WHATSAPP_DESCONECTADO" | "WHATSAPP_FALHA_ENVIO";

const TEXTOS: Record<CodigoAlerta, { titulo: string; texto: string }> = {
  WHATSAPP_DESCONECTADO: {
    titulo: "WhatsApp desconectado",
    texto: "A régua segurou as cobranças deste canal. Conecte de novo pelo QR Code para o envio continuar. Nenhuma mensagem foi apagada.",
  },
  WHATSAPP_FALHA_ENVIO: {
    titulo: "Falha no WhatsApp",
    texto: "Uma cobrança da régua não saiu pelo WhatsApp. Veja a fila e a conexão antes de tentar de novo.",
  },
};

function codigoDe(valor: string): CodigoAlerta | null {
  if (valor === "WHATSAPP_DESCONECTADO" || valor === "WHATSAPP_FALHA_ENVIO") return valor;
  return null;
}

export async function abrirAlerta(empresaId: string, codigo: CodigoAlerta): Promise<void> {
  const aviso = TEXTOS[codigo];
  await prisma.alertaEmpresa.upsert({
    where: { empresaId_codigo: { empresaId, codigo } },
    create: { empresaId, codigo, titulo: aviso.titulo, texto: aviso.texto, lido: false },
    update: { titulo: aviso.titulo, texto: aviso.texto, lido: false },
  });
}

export async function resolverAlerta(empresaId: string, codigo: CodigoAlerta): Promise<void> {
  await prisma.alertaEmpresa.updateMany({
    where: { empresaId, codigo, lido: false },
    data: { lido: true },
  });
}

export async function listarAlertasDaEmpresa(empresaId: string): Promise<AlertaEmpresaDTO[]> {
  const linhas = await prisma.alertaEmpresa.findMany({
    where: { empresaId, lido: false },
    orderBy: { atualizadoEm: "desc" },
  });
  return linhas.flatMap((linha) => {
    const codigo = codigoDe(linha.codigo);
    if (!codigo) return [];
    return [{ codigo, titulo: linha.titulo, texto: linha.texto, lido: linha.lido }];
  });
}
