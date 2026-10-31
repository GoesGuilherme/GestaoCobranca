import type { TomAviso } from "@/lib/textos-feedback";

const estilos: Record<TomAviso | "info", string> = {
  ok: "border-ok/30 bg-leaf text-ok",
  erro: "border-clay/40 bg-clay-soft text-clay",
  alerta: "border-gold/50 bg-gold-soft text-gold-ink",
  info: "border-line bg-sand text-ink",
};

export function Aviso({
  tom,
  titulo,
  children,
  onFechar,
}: {
  tom: TomAviso | "info";
  titulo: string;
  children?: React.ReactNode;
  onFechar?: () => void;
}) {
  const papel = tom === "erro" || tom === "alerta" ? "alert" : "status";
  return (
    <div role={papel} className={`rounded-2xl border px-4 py-3 text-sm ${estilos[tom]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{titulo}</p>
        {onFechar ? (
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 rounded-full px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
            aria-label="Fechar aviso"
          >
            Fechar
          </button>
        ) : null}
      </div>
      {children ? <div className="mt-2 space-y-2">{children}</div> : null}
    </div>
  );
}
