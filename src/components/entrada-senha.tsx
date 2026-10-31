"use client";

import { useState } from "react";
import { classeCampo } from "./estilos";

export function EntradaSenha({
  id,
  value,
  onChange,
  onBlur,
  autoComplete,
  descricaoId,
  invalido,
  "aria-invalid": ariaInvalido,
  "aria-describedby": ariaDescrito,
  "aria-required": ariaObrigatorio,
}: {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  autoComplete: string;
  descricaoId?: string;
  invalido?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visivel ? "text" : "password"}
        autoComplete={autoComplete}
        className={`${classeCampo} pr-24`}
        value={value}
        aria-invalid={invalido || ariaInvalido || undefined}
        aria-describedby={descricaoId ?? ariaDescrito}
        aria-required={ariaObrigatorio}
        onChange={(evento) => onChange(evento.target.value)}
        onBlur={onBlur}
      />
      <button
        type="button"
        className="absolute inset-y-1 right-1 rounded-full px-3 text-xs font-medium text-canopy hover:bg-sand"
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => setVisivel((atual) => !atual)}
      >
        {visivel ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
