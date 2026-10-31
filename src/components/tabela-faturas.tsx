import Link from "next/link";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { opcoesDaReguaAplicavel, rotuloReguaDaFatura, type OpcaoPassoRegua, type PassoParaRotulo } from "@/lib/regua";
import { rotuloFormaCobranca } from "@/lib/rotulos";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesFatura } from "./acoes-fatura";
import { SeloFatura } from "./selo";
import { SemaforoRegua } from "./semaforo-regua";

function OlhoVisualizada() {
  return (
    <span title="Cliente visualizou o boleto" aria-label="Cliente visualizou o boleto" className="inline-flex text-canopy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </span>
  );
}

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
  reguasEnvio,
  modoTeste = false,
  emailLogado = "",
}: {
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  mostrarCliente: boolean;
  destaqueId?: string | null;
  preferencias?: PreferenciasCobrancaDTO;
  passosRegua?: OpcaoPassoRegua[];
  podeEnviarRegua?: boolean;
  vinculos?: ClienteServicoDTO[];
  passosCliente?: PassoParaRotulo[] | null;
  hoje?: string;
  reguasEnvio?: { id: string; padrao: boolean; nome: string; passos: { id: string; naEmissao: boolean; dias: number | null; assunto?: string; canal?: string }[] }[];
  modoTeste?: boolean;
  emailLogado?: string;
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
            const passosEnvio = reguasEnvio
              ? opcoesDaReguaAplicavel({ modo: fatura.reguaModo, reguaId: fatura.reguaId }, reguasEnvio)
              : passosRegua;
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
              <span className="inline-flex items-center gap-2">
                {fatura.visualizada ? <OlhoVisualizada /> : null}
                <SeloFatura status={fatura.status} excluida={fatura.excluida} />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {rotulo ? <SemaforoRegua fase={rotulo.fase} texto={rotulo.texto} aria={rotulo.aria} /> : <span />}
              <AcoesFatura
                fatura={fatura}
                podeCancelar={podeCancelar}
                preferencias={preferencias}
                passosRegua={passosEnvio}
                podeEnviarRegua={podeEnviarRegua}
                vinculos={vinculos}
                modoTeste={modoTeste}
                emailLogado={emailLogado}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
