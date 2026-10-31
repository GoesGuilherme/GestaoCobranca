"use client";

import { classeBotaoSecundario } from "./estilos";

export function Paginacao({
  pagina,
  total,
  tamanho,
  onChange,
}: {
  pagina: number;
  total: number;
  tamanho: number;
  onChange: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  if (total <= tamanho) return null;
  const inicio = (pagina - 1) * tamanho + 1;
  const fim = Math.min(total, pagina * tamanho);

  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        {inicio}–{fim} de {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={classeBotaoSecundario}
          disabled={pagina <= 1}
          onClick={() => onChange(pagina - 1)}
        >
          Anterior
        </button>
        <p className="min-w-24 text-center text-sm tabular-nums">
          Página {pagina} de {paginas}
        </p>
        <button
          type="button"
          className={classeBotaoSecundario}
          disabled={pagina >= paginas}
          onClick={() => onChange(pagina + 1)}
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}
