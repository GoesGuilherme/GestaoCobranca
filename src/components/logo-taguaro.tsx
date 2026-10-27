const ESCURO = "#0B3861";
const CLARO = "#36679D";
const DOURADO = "#C7922E";

function Marca({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" strokeWidth="8.5" strokeLinecap="round">
        <path stroke={ESCURO} d="M 14.68 22.00 A 20.00 20.00 0 0 1 46.14 17.86" />
        <path stroke={DOURADO} d="M 35.47 12.30 A 20.00 20.00 0 0 1 40.13 13.73" />
        <path stroke={ESCURO} d="M 49.32 22.00 A 20.00 20.00 0 0 1 38.84 50.79" />
        <path stroke={DOURADO} d="M 49.14 42.30 A 20.00 20.00 0 0 1 46.14 46.14" />
        <path stroke={CLARO} d="M 33.74 51.92 A 20.00 20.00 0 0 1 12.08 30.26" />
        <path stroke={DOURADO} d="M 15.62 43.47 A 20.00 20.00 0 0 1 13.33 39.17" />
      </g>
    </svg>
  );
}

export function LogoTaguaro({
  tom,
  compacto = false,
}: {
  tom: "claro" | "escuro";
  compacto?: boolean;
}) {
  const nome = tom === "escuro" ? "#F4F7FB" : ESCURO;
  return (
    <span className={`inline-flex items-center ${compacto ? "gap-2" : "gap-2.5"}`}>
      <Marca className={compacto ? "size-8 shrink-0" : "size-10 shrink-0"} />
      <span
        className={`font-sans font-medium leading-none tracking-[-0.04em] ${compacto ? "text-xl" : "text-[1.7rem]"}`}
        style={{ color: nome }}
      >
        taguaro
      </span>
    </span>
  );
}
