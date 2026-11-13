import { NextResponse } from "next/server";
import { tokenPublicoValido } from "@/lib/pix-link";
import { pngPagamentoPublico } from "@/server/services/pix-publico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  if (!tokenPublicoValido(token)) return new NextResponse(null, { status: 404 });
  const png = await pngPagamentoPublico(token);
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": 'inline; filename="pix.png"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
