import { LogoTaguaro } from "./logo-taguaro";

const RECURSOS_COBRANCA = [
  "Régua automática por SMS, e-mail e WhatsApp",
  "Recorrência no cartão, boleto ou Pix",
  "Várias unidades por cliente",
  "Asaas e Banco Inter",
  "Baixa automática diária",
  "Para todo o Brasil",
] as const;

export function MolduraAcesso({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-forest-deep text-paper lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              "radial-gradient(ellipse 85% 68% at 78% 12%, color-mix(in srgb, var(--color-canopy) 62%, transparent), transparent 62%)",
              "radial-gradient(ellipse 62% 52% at 64% 22%, color-mix(in srgb, var(--color-forest) 88%, transparent), transparent 68%)",
              "radial-gradient(ellipse 28% 22% at 100% 0%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 72%)",
            ].join(", "),
          }}
        />
        <TracoDourado />
        <div className="@container relative z-10 flex w-full flex-col px-10 py-12 xl:px-14 xl:py-14">
          <LogoTaguaro tom="escuro" />
          <div className="mt-[clamp(2.75rem,9cqi,4.75rem)] max-w-2xl">
            <h2 className="max-w-[18em] font-display text-[clamp(1.45rem,5.6cqi,3.35rem)] font-semibold leading-[1.08]">
              Seu time de cobrança, 24 horas,
              <br />
              numa só ferramenta.
            </h2>
            <ul className="mt-[clamp(1.75rem,4.5cqi,2.75rem)] space-y-[clamp(0.7rem,1.5cqi,1.15rem)] text-[clamp(0.98rem,2.15cqi,1.2rem)] leading-snug">
              {RECURSOS_COBRANCA.map((item) => (
                <li key={item} className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="font-medium text-gold">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section id="conteudo" className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <p className="mb-6 lg:hidden">
            <LogoTaguaro tom="claro" />
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}

function TracoDourado() {
  const traco = "M610 -12C750 36 805 150 792 320";
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 800 1000"
      fill="none"
      preserveAspectRatio="xMaxYMin slice"
      aria-hidden="true"
      style={{ "--traco-claro": "color-mix(in srgb, var(--color-gold) 42%, white)" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="traco-dourado" x1="620" y1="0" x2="800" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0" />
          <stop offset="32%" stopColor="var(--color-gold)" stopOpacity="0.55" />
          <stop offset="55%" stopColor="var(--traco-claro)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
        </linearGradient>
        <filter id="brilho-dourado" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <path d={traco} stroke="url(#traco-dourado)" strokeWidth="10" strokeLinecap="round" filter="url(#brilho-dourado)" />
      <path d={traco} stroke="url(#traco-dourado)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
