"use client";

import { useState } from "react";

export function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-4 py-2.5 text-sm font-medium text-paper"
      >
        {copiado ? "Pix copiado" : "Copiar Pix (Copia e Cola)"}
      </button>
      <p className="break-all rounded-2xl bg-sand px-3 py-3 font-mono text-xs leading-5 text-ink">{codigo}</p>
    </div>
  );
}
