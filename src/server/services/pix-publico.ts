import { dataHojeIso } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { caminhoLogoPublica } from "@/lib/logo";
import { tokenPublicoValido } from "@/lib/pix-link";
import { situacaoPublicaPix, type SituacaoPublicaPix } from "@/lib/pix-publico";
import { pngDoBrCode } from "@/lib/pix-qr";
import { prisma } from "@/server/db";
import { espelhoFaturaPix } from "@/server/pagamentos/gravacao";

export type { SituacaoPublicaPix };

export type PagamentoPixPublico = {
  empresa: string;
  logoUrl: string | null;
  descricao: string;
  valor: string;
  vencimento: string;
  status: SituacaoPublicaPix;
  pagavel: boolean;
  pixCopiaCola: string | null;
};

export async function obterPagamentoPublico(token: string, agora = new Date()): Promise<PagamentoPixPublico | null> {
  if (!tokenPublicoValido(token)) return null;
  const fatura = await prisma.fatura.findUnique({
    where: { tokenPublico: token },
    select: {
      id: true,
      empresaId: true,
      provedor: true,
      status: true,
      excluida: true,
      valor: true,
      vencimento: true,
      descricao: true,
      pixCopiaCola: true,
      empresa: { select: { nomeFantasia: true, logo: { select: { atualizadoEm: true } } } },
    },
  });
  if (!fatura || fatura.provedor !== "PIX_DIRETO") return null;

  const hoje = dataHojeIso(agora);
  const vencimento = fatura.vencimento.toISOString().slice(0, 10);
  if (!fatura.excluida && fatura.status === "EM_ABERTO" && vencimento < hoje) {
    await prisma.fatura.updateMany({
      where: { id: fatura.id, empresaId: fatura.empresaId, status: "EM_ABERTO" },
      data: { status: "VENCIDA", ...espelhoFaturaPix({ status: "VENCIDA" }) },
    });
    fatura.status = "VENCIDA";
  }

  const situacao = situacaoPublicaPix(fatura.status, vencimento, hoje, fatura.excluida);
  const pagavel = situacao === "Em aberto" || situacao === "Vencida";
  const logo = fatura.empresa.logo
    ? caminhoLogoPublica(fatura.empresaId, fatura.empresa.logo.atualizadoEm.toISOString())
    : null;

  return {
    empresa: fatura.empresa.nomeFantasia,
    logoUrl: logo,
    descricao: fatura.descricao?.trim() || "Cobrança",
    valor: formatarReais(fatura.valor.toFixed(2)),
    vencimento: formatarDataIso(vencimento),
    status: situacao,
    pagavel,
    pixCopiaCola: pagavel ? fatura.pixCopiaCola : null,
  };
}

export async function pngPagamentoPublico(token: string): Promise<Buffer | null> {
  if (!tokenPublicoValido(token)) return null;
  const fatura = await prisma.fatura.findUnique({
    where: { tokenPublico: token },
    select: { provedor: true, excluida: true, status: true, pixCopiaCola: true },
  });
  if (!fatura || fatura.provedor !== "PIX_DIRETO" || fatura.excluida || !fatura.pixCopiaCola) return null;
  const bruto = fatura.status.trim().toUpperCase();
  if (bruto !== "EM_ABERTO" && bruto !== "VENCIDA") return null;
  return pngDoBrCode(fatura.pixCopiaCola);
}
