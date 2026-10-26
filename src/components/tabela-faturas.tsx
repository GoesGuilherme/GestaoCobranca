import Link from "next/link";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { rotuloReguaDaFatura, type PassoParaRotulo } from "@/lib/regua";
import { rotuloFormaCobranca } from "@/lib/rotulos";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesFatura } from "./acoes-fatura";
import { SeloFatura } from "./selo";
import { SemaforoRegua } from "./semaforo-regua";

export function TabelaFaturas({
  faturas,
  podeCancelar,
  mostrarCliente,
  destaqueId,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
  passosRegua = [],
  podeEnviarRegua = false,
  vinculos = [],
  passosCliente = null,
  hoje = "",
}: {
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  mostrarCliente: boolean;
  destaqueId?: string | null;
  preferencias?: PreferenciasCobrancaDTO;
  passosRegua?: { id: string; rotulo: string }[];
  podeEnviarRegua?: boolean;
  vinculos?: ClienteServicoDTO[];
  passosCliente?: PassoParaRotulo[] | null;
  hoje?: string;
}) {
  if (faturas.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-sm text-muted">
        Nenhuma fatura nesta lista.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
      {faturas.map((fatura) => {
        const rotulo = hoje
          ? rotuloReguaDaFatura({
              status: fatura.status,
              excluida: fatura.excluida,
              vencimento: fatura.vencimento,
              hoje,
              passos: passosCliente,
            })
          : null;
        return (
          <li
            key={fatura.id}
            id={`fatura-${fatura.id}`}
            className={`scroll-mt-24 px-4 py-4 ${fatura.excluida ? "opacity-60" : ""} ${destaqueId === fatura.id ? "bg-gold-soft" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {mostrarCliente ? (
                  <Link href={`/clientes/${fatura.clienteId}`} className="font-medium text-canopy hover:underline">
                    {fatura.nomeCliente}
                  </Link>
                ) : null}
                <p className={mostrarCliente ? "mt-1 text-sm" : "text-sm font-medium"}>
                  {formatarDataIso(fatura.vencimento)} · {formatarReais(fatura.valor)}
                </p>
                <p className="text-xs text-muted">
                  {rotuloFormaCobranca(fatura.formaCobranca)}
                  {fatura.nomeServico ? ` · ${fatura.nomeServico}` : ""}
                </p>
              </div>
              <SeloFatura status={fatura.status} excluida={fatura.excluida} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {rotulo ? <SemaforoRegua fase={rotulo.fase} texto={rotulo.texto} aria={rotulo.aria} /> : <span />}
              <AcoesFatura
                fatura={fatura}
                podeCancelar={podeCancelar}
                preferencias={preferencias}
                passosRegua={passosRegua}
                podeEnviarRegua={podeEnviarRegua}
                vinculos={vinculos}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
