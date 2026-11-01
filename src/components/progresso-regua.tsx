import type { ReactNode } from "react";
import { AlarmClock, Bell, CalendarDays, CheckCircle2, type LucideIcon } from "lucide-react";
import { ariaProgressoRegua, textoEtapa, type EtapaRegua, type MomentoEtapa, type ProgressoRegua } from "@/lib/regua-progresso";

const ICONE: Record<MomentoEtapa, LucideIcon> = {
  antes: Bell,
  vencimento: CalendarDays,
  atraso: AlarmClock,
};

function classeEtapa(etapa: EtapaRegua): string {
  if (!etapa.enviada) return "text-muted opacity-40";
  if (etapa.momento === "atraso") return "text-gold ring-1 ring-current";
  return "text-canopy ring-1 ring-current";
}

function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <span title={texto} aria-hidden="true" className="inline-flex">
      {children}
    </span>
  );
}

export function ProgressoRegua({ progresso }: { progresso: ProgressoRegua }) {
  if (progresso.etapas.length === 0) return null;
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={ariaProgressoRegua(progresso)}
      className="mx-auto flex w-max max-w-full flex-nowrap items-center justify-center gap-1.5 overflow-x-auto rounded-full bg-sand px-2.5 py-1.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {progresso.etapas.map((etapa) => {
        const Icone = ICONE[etapa.momento];
        const texto = textoEtapa(etapa);
        return (
          <Dica key={etapa.id} texto={texto}>
            <span className={`inline-flex shrink-0 rounded-full p-1 ${classeEtapa(etapa)}`}>
              <Icone className="size-[22px]" strokeWidth={1.8} aria-hidden />
            </span>
          </Dica>
        );
      })}
      {progresso.paga ? (
        <Dica texto="Fatura paga">
          <span className="inline-flex shrink-0 rounded-full p-1 text-ok ring-1 ring-current">
            <CheckCircle2 className="size-[22px]" strokeWidth={1.8} aria-hidden />
          </span>
        </Dica>
      ) : null}
    </div>
  );
}
