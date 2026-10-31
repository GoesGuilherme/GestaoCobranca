export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="font-display text-2xl text-ink">{titulo}</p>
      {descricao ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{descricao}</p> : null}
      {acao ? <div className="mt-5 flex justify-center">{acao}</div> : null}
    </div>
  );
}
