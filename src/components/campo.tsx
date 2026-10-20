import { classeCampo } from "./estilos";

export function Campo({
  label,
  htmlFor,
  erro,
  dica,
  children,
}: {
  label: string;
  htmlFor: string;
  erro?: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {erro ? <p className="mt-1 text-xs text-clay">{erro}</p> : null}
      {!erro && dica ? <p className="mt-1 text-xs text-muted">{dica}</p> : null}
    </div>
  );
}

export { classeCampo };
