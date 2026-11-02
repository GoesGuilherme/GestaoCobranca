import { Check } from "lucide-react";
import { ariaLinhaDoTempoFatura, type LinhaDoTempoFatura, type MarcoFatura } from "@/lib/linha-tempo-fatura";
import { COR_FASE_LINHA_TEMPO, type FaseLinhaTempo } from "@/lib/linha-tempo-regua";

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

export function LinhaDoTempoFatura({ linha }: { linha: LinhaDoTempoFatura }) {
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
      <div role="group" aria-label={ariaLinhaDoTempoFatura(linha)} className="flex w-max items-start">
        {linha.semRegua ? <span className="mr-3 mt-1 shrink-0 text-[13px] text-muted">Sem régua</span> : null}
        <ol className="flex items-start">
          {linha.marcadores.map((marco, posicao) => {
            const proximo = linha.marcadores[posicao + 1];
            const rotulo = corRotulo(marco);
            return (
              <li key={`${marco.chave}-${posicao}`} className="w-[8.75rem] shrink-0 sm:w-40">
                <div className="relative flex h-8 w-full items-center justify-center">
                  {proximo ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-1/2 h-1 w-full -translate-y-1/2"
                      style={{ background: degrade(marco.fase, proximo.fase, marco.aceso, proximo.aceso) }}
                    />
                  ) : null}
                  <span
                    title={marco.dica}
                    className="relative z-10 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-[13px] font-semibold tabular-nums"
                    style={{ backgroundColor: corMarca(marco), color: corTexto(marco) }}
                  >
                    {marco.fase === "pago" ? <Check className="size-[22px]" strokeWidth={2.75} aria-hidden /> : marco.texto}
                  </span>
                </div>
                <p className="mt-2 px-1.5 text-center text-[13px] font-semibold leading-snug" style={{ color: rotulo }}>
                  {marco.titulo}
                </p>
                {marco.detalhe ? (
                  <p className="mt-0.5 px-1.5 text-center text-[13px] leading-snug" style={{ color: rotulo }}>
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
