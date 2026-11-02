import { useId } from "react";
import type { ClassificacaoPagador, ResultadoClassificacaoPagador } from "@/lib/classificacao-pagador";

const CORES: Record<ClassificacaoPagador, { claro: string; escuro: string }> = {
  bom: { claro: "#1e8a57", escuro: "#146c43" },
  regular: { claro: "#E8B84A", escuro: "#D4A02C" },
  mau: { claro: "#E05A4F", escuro: "#B03A2E" },
};

const PX = { lista: 24, ficha: 46 } as const;

function caminhoRoseta(): string {
  const dentes = 14;
  const amostras = 8;
  const total = dentes * amostras;
  const cx = 32;
  const cy = 32;
  const raio = 24.6;
  const amplitude = 4.6;
  let caminho = "";
  for (let i = 0; i <= total; i += 1) {
    const t = (i / total) * Math.PI * 2 - Math.PI / 2;
    const r = raio + amplitude * Math.cos(dentes * t);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    caminho += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${caminho}Z`;
}

const ROSETA = caminhoRoseta();

function Icone({ classificacao }: { classificacao: ClassificacaoPagador }) {
  if (classificacao === "bom") {
    return (
      <path
        d="M22.8 33.2 29.4 39.8 42.2 25.2"
        fill="none"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (classificacao === "regular") {
    return (
      <g fill="none" stroke="#fff" strokeWidth="2.7" strokeLinecap="round">
        <circle cx="32" cy="32" r="9.2" />
        <path d="M32 32.4V25.2M32 32.4l5.5 3.8" />
      </g>
    );
  }
  return (
    <g fill="#fff" stroke="#fff" strokeLinecap="round">
      <path d="M32 22.6v11.2" fill="none" strokeWidth="4.2" />
      <circle cx="32" cy="39.6" r="2.05" stroke="none" />
    </g>
  );
}

function Medalha({ classificacao, px }: { classificacao: ClassificacaoPagador; px: number }) {
  const bruto = useId().replace(/:/g, "");
  const gradiente = `selo-grad-${bruto}`;
  const brilho = `selo-brilho-${bruto}`;
  const recorte = `selo-recorte-${bruto}`;
  const cores = CORES[classificacao];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="block shrink-0"
      style={{ filter: "drop-shadow(0 1px 1.5px rgba(5, 26, 58, 0.28))" }}
    >
      <defs>
        <linearGradient id={gradiente} x1="32%" y1="0%" x2="68%" y2="100%">
          <stop offset="0%" stopColor={cores.claro} />
          <stop offset="100%" stopColor={cores.escuro} />
        </linearGradient>
        <radialGradient id={brilho} cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={recorte}>
          <path d={ROSETA} />
        </clipPath>
      </defs>
      <path d={ROSETA} fill={`url(#${gradiente})`} />
      <path d={ROSETA} fill={`url(#${brilho})`} clipPath={`url(#${recorte})`} />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="1.25" />
      <Icone classificacao={classificacao} />
    </svg>
  );
}

export function SeloPagador({
  resultado,
  tamanho,
}: {
  resultado: ResultadoClassificacaoPagador | null | undefined;
  tamanho: "lista" | "ficha";
}) {
  if (!resultado) return null;
  const descricao = `${resultado.rotulo}. ${resultado.tooltip}`;
  const px = PX[tamanho];

  return (
    <span
      role="img"
      title={descricao}
      aria-label={descricao}
      className="inline-flex max-w-full shrink-0 items-center gap-2 align-middle"
    >
      <Medalha classificacao={resultado.classificacao} px={px} />
      {tamanho === "ficha" ? (
        <span aria-hidden="true" className="text-sm font-semibold tracking-tight text-ink sm:text-base">
          {resultado.rotulo}
        </span>
      ) : null}
    </span>
  );
}
