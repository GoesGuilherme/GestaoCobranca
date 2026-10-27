"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";

const itensBase = [
  { href: "/dashboards/painel", rotulo: "Dashboards" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/servicos", rotulo: "Serviços" },
];

function ativo(pathname: string, href: string) {
  if (href === "/dashboards/painel") return pathname === "/dashboards" || pathname.startsWith("/dashboards/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BarraLateral({
  nome,
  email,
  nomeEmpresa,
  mostrarUsuarios,
  mostrarFaturas,
  mostrarRegua,
  mostrarResultado,
  mostrarAsaas,
  mostrarAdmin,
}: {
  nome: string;
  email: string;
  nomeEmpresa: string;
  mostrarUsuarios: boolean;
  mostrarFaturas: boolean;
  mostrarRegua: boolean;
  mostrarResultado: boolean;
  mostrarAsaas: boolean;
  mostrarAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const itens = [
    itensBase[0],
    itensBase[1],
    ...(mostrarFaturas ? [{ href: "/faturas", rotulo: "Faturas" }] : []),
    ...(mostrarRegua ? [{ href: "/regua", rotulo: "Régua" }] : []),
    itensBase[2],
    ...(mostrarResultado ? [{ href: "/resultado", rotulo: "Resultado" }] : []),
    ...(mostrarAsaas ? [{ href: "/asaas", rotulo: "Asaas" }] : []),
    ...(mostrarUsuarios ? [{ href: "/usuarios", rotulo: "Usuários" }] : []),
    ...(mostrarUsuarios ? [{ href: "/empresa", rotulo: "Empresa" }] : []),
    ...(mostrarAdmin ? [{ href: "/admin", rotulo: "Plataforma" }] : []),
  ];

  async function sair() {
    await enviarJson("/api/auth/sair", "POST");
    router.push("/login");
    router.refresh();
  }

  const navegacao = (
    <nav className="flex flex-wrap gap-2 md:flex-col">
      {itens.map((item) => {
        const ligado = ativo(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-2 text-sm font-medium transition md:rounded-xl ${
              ligado ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 grid-rows-[auto_minmax(0,1fr)_auto] bg-forest-deep text-paper md:grid">
        <div className="px-6 pt-6">
          <Link href="/" className="block">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gold text-sm font-semibold text-forest-deep">
              GC
            </span>
            <span className="mt-4 block font-display text-2xl leading-none">Gestão Cobrança</span>
            <span className="mt-2 block text-sm text-white/65">{nomeEmpresa}</span>
          </Link>
        </div>
        <div className="overflow-y-auto px-4 py-6">{navegacao}</div>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-white/60">{email}</p>
          <button
            type="button"
            onClick={sair}
            className="mt-3 w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-line bg-forest-deep text-paper md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-display text-xl">
            Gestão Cobrança
          </Link>
          <button type="button" onClick={sair} className="cursor-pointer text-sm text-white/80">
            Sair
          </button>
        </div>
        <div className="px-4 pb-3">{navegacao}</div>
      </div>
    </>
  );
}
