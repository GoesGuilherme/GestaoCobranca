import { NextResponse } from "next/server";
import { exigirAcesso } from "@/server/auth/acesso";
import { exigirVerFaturas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro } from "@/server/http";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const acesso = await exigirAcesso();
    exigirVerFaturas(acesso);
    const { id } = await contexto.params;
    const fatura = await prisma.fatura.findFirst({
      where: { id, empresaId: acesso.empresaId, provedor: "INTER" },
      select: { idExterno: true },
    });
    if (!fatura?.idExterno) throw new ErroAplicacao("Boleto não encontrado.", 404, "nao_encontrado");
    const provedor = await provedorDaEmpresa(acesso.empresaId);
    if (!provedor.obterPdf) throw new ErroAplicacao("Este banco não entrega o PDF do boleto.", 422, "pdf_indisponivel");
    const base64 = await provedor.obterPdf(fatura.idExterno);
    const pdf = Buffer.from(base64, "base64");
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=\"boleto-inter.pdf\"",
        "cache-control": "private, no-store",
      },
    });
  } catch (erro) {
    return jsonErro(erro);
  }
}
