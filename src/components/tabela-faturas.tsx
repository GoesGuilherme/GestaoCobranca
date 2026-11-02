import Link from "next/link";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarReais } from "@/lib/dinheiro";
import { dataHojeIso } from "@/lib/data";
import { formatarDataIso } from "@/lib/formatacao";
import { opcoesDaReguaAplicavel, rotuloReguaDaFatura, type OpcaoPassoRegua, type PassoParaRotulo } from "@/lib/regua";
import { linhaDoTempoDaFatura } from "@/lib/linha-tempo-fatura";
import type { EnvioReguaLista, ReguaParaProgresso } from "@/lib/regua-progresso";
import { rotuloFormaCobranca } from "@/lib/rotulos";
import type { ResultadoClassificacaoPagador } from "@/lib/classificacao-pagador";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesFatura } from "./acoes-fatura";
import { LinhaDoTempoFatura } from "./linha-tempo-fatura";
import { SeloFatura } from "./selo";
import { SeloPagador } from "./selo-pagador";
import { SemaforoRegua } from "./semaforo-regua";

const COLUNAS = "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto]";

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
  enviosRegua = [],
  modoTeste = false,
  emailLogado = "",
  selos = {},
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
  reguasEnvio?: ReguaParaProgresso[];
  enviosRegua?: EnvioReguaLista[];
  modoTeste?: boolean;
  emailLogado?: string;
  selos?: Record<string, ResultadoClassificacaoPagador | null>;
}) {
  if (faturas.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-sm text-muted">
        Nenhuma fatura nesta lista.
      </p>
    );
  }

  const enviosPorFatura = new Map<string, EnvioReguaLista[]>();
  for (const envio of enviosRegua) {
    const lista = enviosPorFatura.get(envio.faturaId);
    if (lista) lista.push(envio);
    else enviosPorFatura.set(envio.faturaId, [envio]);
  }

  return (
    <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
      <li className={`hidden items-center gap-x-6 border-line px-4 py-3 md:grid ${COLUNAS} md:rounded-t-3xl`}>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Fatura</span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Régua</span>
        <span className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-muted">Situação</span>
      </li>
      {faturas.map((fatura, indice) => {
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
        const linhaTempo = linhaDoTempoDaFatura({
          status: fatura.status,
          excluida: fatura.excluida,
          vencimento: fatura.vencimento,
          hoje: hoje || dataHojeIso(),
          modo: fatura.reguaModo,
          reguaId: fatura.reguaId,
          reguas: reguasEnvio,
          envios: enviosPorFatura.get(fatura.id) ?? [],
        });
        const situacao = (
          <span className="inline-flex shrink-0 items-center gap-2">
            {fatura.visualizada ? <OlhoVisualizada /> : null}
            <SeloFatura status={fatura.status} excluida={fatura.excluida} />
          </span>
        );
        return (
          <li
            key={fatura.id}
            id={`fatura-${fatura.id}`}
            className={`scroll-mt-24 grid grid-cols-1 items-center gap-3 px-4 py-4 last:rounded-b-3xl md:gap-x-6 ${COLUNAS} ${indice === 0 ? "rounded-t-3xl md:rounded-t-none" : ""} ${fatura.excluida ? "opacity-60" : ""} ${destaqueId === fatura.id ? "bg-gold-soft" : ""}`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3 md:block">
              <div className="min-w-0">
                {mostrarCliente ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Link href={`/clientes/${fatura.clienteId}`} className="font-medium text-canopy hover:underline">
                      {fatura.nomeCliente}
                    </Link>
                    <SeloPagador resultado={selos[fatura.clienteId]} tamanho="lista" />
                  </span>
                ) : null}
                <p className={mostrarCliente ? "mt-1 text-sm" : "text-sm font-medium"}>
                  {formatarDataIso(fatura.vencimento)} · {formatarReais(fatura.valor)}
                </p>
                <p className="text-xs text-muted">
                  {rotuloFormaCobranca(fatura.formaCobranca)}
                  {fatura.nomeServico ? ` · ${fatura.nomeServico}` : ""}
                </p>
                {rotulo ? (
                  <div className="mt-2">
                    <SemaforoRegua fase={rotulo.fase} texto={rotulo.texto} aria={rotulo.aria} />
                  </div>
                ) : null}
              </div>
              <span className="md:hidden">{situacao}</span>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted md:hidden">Régua</p>
              <LinhaDoTempoFatura linha={linhaTempo} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 md:flex-col md:items-end md:justify-center">
              <span className="hidden md:inline-flex">{situacao}</span>
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
