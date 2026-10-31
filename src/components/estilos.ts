export const classeCampo =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-gold focus:ring-4 focus:ring-gold/25 aria-[invalid=true]:border-clay aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-clay/15";

const baseBotao =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60";

export const classeBotaoPrimario = `${baseBotao} bg-forest text-paper hover:bg-canopy`;

export const classeBotaoSecundario = `${baseBotao} border border-line bg-card text-ink hover:bg-sand`;

export const classeBotaoPerigo = `${baseBotao} border border-clay/30 bg-clay-soft text-clay hover:bg-clay hover:text-white`;

export const classeCabecalhoTabela =
  "sticky top-0 z-10 border-b border-line bg-card text-xs uppercase tracking-wide text-muted";

export const classeTabelaRolavel = "max-h-[min(70vh,48rem)] overflow-auto rounded-3xl border border-line bg-card";
