"use client";

import { useEffect, useId, useRef } from "react";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  confirmarRotulo,
  cancelarRotulo = "Voltar",
  perigo = false,
  enviando = false,
  onConfirmar,
  onCancelar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  confirmarRotulo: string;
  cancelarRotulo?: string;
  perigo?: boolean;
  enviando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  children?: React.ReactNode;
}) {
  const tituloId = useId();
  const descricaoId = useId();
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const aoCancelar = useRef(onCancelar);
  aoCancelar.current = onCancelar;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelarRef.current?.focus();
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape" && !enviando) aoCancelar.current();
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      anterior?.focus();
    };
  }, [aberto, enviando]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl"
      >
        <h2 id={tituloId} className="font-display text-2xl text-ink">
          {titulo}
        </h2>
        {descricao ? (
          <p id={descricaoId} className="mt-2 text-sm leading-6 text-muted">
            {descricao}
          </p>
        ) : null}
        {children ? <div className="mt-3 text-sm text-ink">{children}</div> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelarRef} type="button" className={classeBotaoSecundario} disabled={enviando} onClick={onCancelar}>
            {cancelarRotulo}
          </button>
          <button
            type="button"
            className={perigo ? classeBotaoPerigo : classeBotaoPrimario}
            disabled={enviando}
            onClick={onConfirmar}
          >
            {enviando ? "Aguarde..." : confirmarRotulo}
          </button>
        </div>
      </div>
    </div>
  );
}
