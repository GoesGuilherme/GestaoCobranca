import Link from "next/link";

export function Trilha({ itens }: { itens: { href?: string; rotulo: string }[] }) {
  return (
    <nav aria-label="Trilha" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {itens.map((item, indice) => {
          const ultimo = indice === itens.length - 1;
          return (
            <li key={`${item.rotulo}-${indice}`} className="flex items-center gap-1.5">
              {indice > 0 ? (
                <span aria-hidden="true" className="text-muted">
                  /
                </span>
              ) : null}
              {item.href && !ultimo ? (
                <Link href={item.href} className="font-medium text-canopy hover:underline">
                  {item.rotulo}
                </Link>
              ) : (
                <span className="text-ink" aria-current={ultimo ? "page" : undefined}>
                  {item.rotulo}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
