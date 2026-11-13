import { Check } from "lucide-react";
import { ariaLinhaDoTempoFatura, type EnvioDoMarco, type LinhaDoTempoFatura, type MarcoFatura } from "@/lib/linha-tempo-fatura";
import { COR_FASE_LINHA_TEMPO, nomeCanalMarcador, type FaseLinhaTempo } from "@/lib/linha-tempo-regua";
import { IconeCanal } from "./icone-canal";

const CINZA = "#D5DEE8";
const CINZA_TEXTO = "#5A6B80";

function corMarca(marco: MarcoFatura): string {
  return marco.aceso ? COR_FASE_LINHA_TEMPO[marco.fase].marca : CINZA;
}

function corTexto(marco: MarcoFatura): string {
  return marco.aceso ? COR_FASE_LINHA_TEMPO[marco.fase].texto : CINZA_TEXTO;
}

function corRotulo(marco: MarcoFatura): string {
  return marco.aceso ? COR_FASE_LINHA_TEMPO[marco.fase].apoio : CINZA_TEXTO;
}

function degrade(atual: FaseLinhaTempo, proxima: FaseLinhaTempo, aceso: boolean, proximoAceso: boolean): string {
  const da = aceso ? COR_FASE_LINHA_TEMPO[atual].marca : CINZA;
  const ate = proximoAceso ? COR_FASE_LINHA_TEMPO[proxima].marca : CINZA;
  return `linear-gradient(90deg, ${da}, ${ate})`;
}

function Horario({ quando }: { quando: string }) {
  const separador = quando.indexOf(", ");
  if (separador === -1) return <span className="tabular-nums">{quando}</span>;
  return (
    <span className="min-w-0 text-center tabular-nums leading-tight">
      <span className="whitespace-nowrap">{quando.slice(0, separador)},</span>{" "}
      <span className="whitespace-nowrap">{quando.slice(separador + 2)}</span>
    </span>
  );
}

function EnviosDoMarco({ envios, cor }: { envios: EnvioDoMarco[]; cor: string }) {
  return (
    <div className="mt-0.5 flex flex-col items-center gap-0.5 px-0.5">
      {envios.map((envio) => {
        const nome = nomeCanalMarcador(envio.canal);
        return (
          <span
            key={envio.canal}
            title={nome}
            className="inline-flex max-w-full items-center justify-center gap-1 text-center text-[11px] leading-tight"
            style={{ color: cor }}
          >
            <IconeCanal canal={envio.canal} className="size-3.5" />
            {envio.quando ? <Horario quando={envio.quando} /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function LinhaDoTempoFatura({ linha }: { linha: LinhaDoTempoFatura }) {
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
      <div role="group" aria-label={ariaLinhaDoTempoFatura(linha)} className="flex w-max items-start lg:w-full">
        {linha.semRegua ? <span className="mr-2 mt-1 shrink-0 text-xs text-muted">Sem régua</span> : null}
        <ol className="flex w-max items-start lg:w-full">
          {linha.marcadores.map((marco, posicao) => {
            const proximo = linha.marcadores[posicao + 1];
            const rotulo = corRotulo(marco);
            const dica = marco.detalhe ? `${marco.dica}. ${marco.detalhe}` : marco.dica;
            return (
              <li key={`${marco.chave}-${posicao}`} className="w-[6.75rem] shrink-0 lg:w-auto lg:min-w-[6.75rem] lg:flex-1">
                <div className="relative flex h-8 w-full items-center justify-center">
                  {proximo ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-1/2 h-1 w-full -translate-y-1/2"
                      style={{ background: degrade(marco.fase, proximo.fase, marco.aceso, proximo.aceso) }}
                    />
                  ) : null}
                  <span
                    title={dica}
                    className="relative z-10 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums"
                    style={{ backgroundColor: corMarca(marco), color: corTexto(marco) }}
                  >
                    {marco.fase === "pago" ? <Check className="size-[22px]" strokeWidth={2.75} aria-hidden /> : marco.texto}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 px-0.5 text-center text-[13px] font-semibold leading-tight" style={{ color: rotulo }}>
                  {marco.titulo}
                </p>
                {marco.envios.length > 0 ? (
                  <EnviosDoMarco envios={marco.envios} cor={rotulo} />
                ) : marco.detalhe ? (
                  <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[11px] leading-tight" style={{ color: rotulo }}>
                    {marco.detalhe}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
