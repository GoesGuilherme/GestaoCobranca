"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AbasDashboards({
  mostrarFinanceiro,
  mostrarResultado,
}: {
  mostrarFinanceiro: boolean;
  mostrarResultado: boolean;
}) {
  const pathname = usePathname();
  const abas = [
    { href: "/dashboards/painel", rotulo: "Painel" },
    ...(mostrarFinanceiro ? [{ href: "/dashboards/financeiro", rotulo: "Financeiro" }] : []),
    ...(mostrarResultado ? [{ href: "/dashboards/resultado", rotulo: "Resultado" }] : []),
  ];

  return (
    <nav aria-label="Dashboards" className="mb-6 flex flex-wrap gap-2">
      {abas.map((aba) => {
        const ligada = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ligada ? "page" : undefined}
            className={
              ligada
                ? "inline-flex items-center justify-center rounded-full bg-forest px-4 py-2 text-sm font-medium text-paper"
                : "inline-flex items-center justify-center rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-sand"
            }
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
