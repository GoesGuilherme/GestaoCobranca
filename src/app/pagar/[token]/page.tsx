import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopiarPix } from "@/components/copiar-pix";
import { NOME_PRODUTO } from "@/lib/marca";
import { tokenPublicoValido } from "@/lib/pix-link";
import { obterPagamentoPublico } from "@/server/services/pix-publico";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar com Pix",
  robots: { index: false, follow: false },
};

export default async function PaginaPagarPix({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenPublicoValido(token)) notFound();
  const pagamento = await obterPagamentoPublico(token);
  if (!pagamento) notFound();

  return (
    <main id="conteudo" className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10">
      <article className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{NOME_PRODUTO}</p>
        <div className="mt-4 flex items-center gap-3">
          {pagamento.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pagamento.logoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl object-contain" />
          ) : null}
          <h1 className="font-display text-3xl">{pagamento.empresa}</h1>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">{pagamento.descricao}</p>
        <dl className="mt-6 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Valor</dt>
            <dd className="font-semibold">{pagamento.valor}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Vencimento</dt>
            <dd className="font-semibold">{pagamento.vencimento}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Situação</dt>
            <dd className="font-semibold">{pagamento.status}</dd>
          </div>
        </dl>
        {pagamento.pagavel && pagamento.pixCopiaCola ? (
          <div className="mt-6 grid justify-items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/publico/pix/${token}`}
              alt="QR Code Pix"
              width={280}
              height={280}
              className="h-auto w-full max-w-[280px]"
            />
            <a href={`/api/publico/pix/${token}`} download="pix.png" className="text-sm font-medium text-canopy hover:underline">
              Baixar QR Code
            </a>
            <div className="w-full">
              <CopiarPix codigo={pagamento.pixCopiaCola} />
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-sand px-4 py-3 text-sm leading-6">
            Esta cobrança está {pagamento.status.toLowerCase()}. O QR Code não está mais disponível.
          </p>
        )}
      </article>
    </main>
  );
}
