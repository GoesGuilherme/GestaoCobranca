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

function degrade(atual: FaseLinhaTempo, proxima: FaseLinhaTempo, aceso: boolean, proximoAceso: boolean): string {
  const da = aceso ? COR_FASE_LINHA_TEMPO[atual].marca : CINZA;
  const ate = proximoAceso ? COR_FASE_LINHA_TEMPO[proxima].marca : CINZA;
  return `linear-gradient(90deg, ${da}, ${ate})`;
}

export function LinhaDoTempoFatura({ linha }: { linha: LinhaDoTempoFatura }) {
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain">
      <div role="group" aria-label={ariaLinhaDoTempoFatura(linha)} className="flex w-max items-center">
        {linha.semRegua ? <span className="mr-2 shrink-0 text-xs text-muted">Sem régua</span> : null}
        <ol className="flex items-center">
          {linha.marcadores.map((marco, posicao) => {
            const proximo = linha.marcadores[posicao + 1];
            return (
              <li key={`${marco.chave}-${posicao}`} className="relative flex h-7 w-9 shrink-0 items-center justify-center">
                {proximo ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-1/2 h-0.5 w-full -translate-y-1/2"
                    style={{ background: degrade(marco.fase, proximo.fase, marco.aceso, proximo.aceso) }}
                  />
                ) : null}
                <span
                  title={marco.dica}
                  aria-label={marco.dica}
                  className="relative z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                  style={{ backgroundColor: corMarca(marco), color: corTexto(marco) }}
                >
                  {marco.fase === "pago" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : marco.texto}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
