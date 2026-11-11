import { NextResponse } from "next/server";
import { idEmpresaLogo } from "@/lib/logo";
import { lerLogoPublica } from "@/server/services/logo-empresa-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexto: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await contexto.params;
  if (!idEmpresaLogo(empresaId)) {
    return new NextResponse(null, { status: 404 });
  }
  const logo = await lerLogoPublica(empresaId);
  if (!logo) return new NextResponse(null, { status: 404 });
  const extensao = logo.mime === "image/png" ? "png" : "jpg";
  return new NextResponse(Buffer.from(logo.bytes), {
    status: 200,
    headers: {
      "content-type": logo.mime,
      "content-disposition": `inline; filename="logo.${extensao}"`,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
