"use client";

import { classeBotaoPrimario } from "@/components/estilos";

export default function ErroPainel({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-3xl border border-line bg-card px-6 py-12">
      <h1 className="font-display text-4xl">Algo saiu do esperado</h1>
      <p className="mt-3 text-muted">Não foi possível carregar esta página.</p>
      <button
        type="button"
        onClick={reset}
        className={`${classeBotaoPrimario} mt-6`}
      >
        Tentar de novo
      </button>
    </div>
  );
}
