export function CabecalhoPagina({
  olho,
  titulo,
  descricao,
  acao,
}: {
  olho?: string;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {olho ? (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">{olho}</p>
        ) : null}
        <h1 className="mt-1 font-display text-3xl tracking-tight text-ink sm:text-4xl">{titulo}</h1>
        {descricao ? <p className="mt-2 max-w-2xl text-muted">{descricao}</p> : null}
      </div>
      {acao}
    </div>
  );
}
