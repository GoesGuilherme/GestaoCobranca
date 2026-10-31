import { cloneElement, isValidElement } from "react";
import { classeCampo } from "./estilos";

export function Campo({
  label,
  htmlFor,
  erro,
  dica,
  obrigatorio,
  children,
}: {
  label: string;
  htmlFor: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  const erroId = erro ? `${htmlFor}-erro` : undefined;
  const dicaId = !erro && dica ? `${htmlFor}-dica` : undefined;
  const descrito = [erroId, dicaId].filter(Boolean).join(" ") || undefined;
  const campo = isValidElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string; "aria-required"?: boolean }>(
    children,
  )
    ? cloneElement(children, {
        "aria-invalid": erro ? true : undefined,
        "aria-describedby": descrito,
        "aria-required": obrigatorio || undefined,
      })
    : children;

  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {obrigatorio ? <span className="text-clay"> *</span> : null}
      </label>
      {campo}
      {erro ? (
        <p id={erroId} className="mt-1 text-xs text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      {!erro && dica ? (
        <p id={dicaId} className="mt-1 text-xs text-muted">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

export { classeCampo };
