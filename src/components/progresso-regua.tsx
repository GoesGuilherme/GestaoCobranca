import type { ReactNode } from "react";
import { AlarmClock, Bell, CalendarDays, CheckCircle2, type LucideIcon } from "lucide-react";
import { ariaProgressoRegua, textoIcone, type IconeRegua, type MarcoRegua, type MomentoEtapa, type ProgressoRegua } from "@/lib/regua-progresso";

const ICONE: Record<MomentoEtapa, LucideIcon> = {
  antes: Bell,
  vencimento: CalendarDays,
  atraso: AlarmClock,
};

function classeIcone(icone: IconeRegua): string {
  if (!icone.aceso) return "text-muted opacity-40";
  if (icone.id === "atraso") return "text-gold ring-1 ring-current";
  if (icone.id === "pago") return "text-ok ring-1 ring-current";
  return "text-canopy ring-1 ring-current";
}

function desenho(id: MarcoRegua): LucideIcon {
  if (id === "pago") return CheckCircle2;
  return ICONE[id];
}

function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <span title={texto} aria-hidden="true" className="flex w-11 justify-center">
      {children}
    </span>
  );
}

export function ProgressoRegua({ progresso }: { progresso: ProgressoRegua }) {
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={ariaProgressoRegua(progresso)}
      className="mx-auto grid w-44 grid-cols-4 justify-items-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {progresso.icones.map((icone) => {
        const Icone = desenho(icone.id);
        return (
          <Dica key={icone.id} texto={textoIcone(icone, progresso.neutra)}>
            <span className={`inline-flex shrink-0 rounded-full p-1 ${classeIcone(icone)}`}>
              <Icone className="size-[22px]" strokeWidth={1.8} aria-hidden />
            </span>
          </Dica>
        );
      })}
    </div>
  );
}
