export function ChipSegmento({ nome, cor }: { nome: string; cor?: string | null }) {
  const fundo = cor && /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : "#36679d";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-ink">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: fundo }} aria-hidden="true" />
      {nome}
    </span>
  );
}
