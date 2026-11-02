import type { FaseRegua } from "@/lib/regua";

const LUZES: { fase: Exclude<FaseRegua, "encerrada">; acesa: string; apagada: string }[] = [
  { fase: "antes", acesa: "bg-[#1f9d55]", apagada: "bg-[#1f9d55]/25" },
  { fase: "hoje", acesa: "bg-[#e6b325]", apagada: "bg-[#e6b325]/25" },
  { fase: "atraso", acesa: "bg-[#d64532]", apagada: "bg-[#d64532]/25" },
];

const TEXTO: Record<FaseRegua, string> = {
  antes: "text-ok",
  hoje: "text-gold-ink",
  atraso: "text-clay",
  encerrada: "text-muted",
};

export function SemaforoRegua({ fase, texto, aria }: { fase: FaseRegua; texto: string; aria: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2" role="img" aria-label={aria}>
      <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-forest-deep px-1.5 py-1">
        {LUZES.map((luz) => (
          <span
            key={luz.fase}
            className={`size-2 rounded-full ${fase === luz.fase ? `${luz.acesa} ring-1 ring-white/80` : luz.apagada}`}
          />
        ))}
      </span>
      <span aria-hidden="true" className={`min-w-0 text-sm font-medium leading-5 ${TEXTO[fase]}`}>
        {texto}
      </span>
    </span>
  );
}
