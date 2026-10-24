import Link from "next/link";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { rotuloFormaCobranca, rotuloStatusFatura } from "@/lib/rotulos";
import type { FaturaDTO } from "@/lib/tipos";
import { BotaoCancelarFatura } from "./botao-cancelar-fatura";

function segundaVia(fatura: FaturaDTO) {
  return fatura.boletoUrl ?? fatura.faturaUrl;
}

export function TabelaFaturas({
  faturas,
  podeCancelar,
  mostrarCliente,
  destaqueId,
}: {
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  mostrarCliente: boolean;
  destaqueId?: string | null;
}) {
  if (faturas.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-sm text-muted">
        Nenhuma fatura nesta lista.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            {mostrarCliente ? <th className="px-4 py-3 font-medium">Cliente</th> : null}
            <th className="px-4 py-3 font-medium">Vencimento</th>
            <th className="px-4 py-3 font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Forma</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3 font-medium">Cobrança</th>
          </tr>
        </thead>
        <tbody>
          {faturas.map((fatura) => {
            const via = segundaVia(fatura);
            return (
              <tr
                key={fatura.id}
                id={`fatura-${fatura.id}`}
                className={`scroll-mt-24 border-b border-line/70 last:border-0 ${destaqueId === fatura.id ? "bg-gold-soft" : ""}`}
              >
                {mostrarCliente ? (
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${fatura.clienteId}`} className="font-medium text-canopy hover:underline">
                      {fatura.nomeCliente}
                    </Link>
                    {fatura.nomeServico ? <p className="text-xs text-muted">{fatura.nomeServico}</p> : null}
                  </td>
                ) : (
                  null
                )}
                <td className="px-4 py-3">{formatarDataIso(fatura.vencimento)}</td>
                <td className="px-4 py-3">
                  {formatarReais(fatura.valor)}
                  {!mostrarCliente && fatura.nomeServico ? <p className="text-xs text-muted">{fatura.nomeServico}</p> : null}
                </td>
                <td className="px-4 py-3">{rotuloFormaCobranca(fatura.formaCobranca)}</td>
                <td className="px-4 py-3">{rotuloStatusFatura(fatura.status, fatura.excluida)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {via ? (
                      <a href={via} target="_blank" rel="noreferrer" className="font-medium text-canopy hover:underline">
                        Segunda via
                      </a>
                    ) : (
                      <span className="text-muted">Sem link</span>
                    )}
                    {podeCancelar && !fatura.excluida ? <BotaoCancelarFatura id={fatura.id} /> : null}
                  </div>
                  {fatura.linhaDigitavel ? (
                    <p className="mt-2 max-w-xs break-all text-xs text-muted">{fatura.linhaDigitavel}</p>
                  ) : null}
                  {fatura.pixCopiaCola ? (
                    <p className="mt-1 max-w-xs break-all text-xs text-muted">Pix: {fatura.pixCopiaCola}</p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
