"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { idGrupoAtual, itemAtivo, montarGruposMenu, type ItemMenu } from "@/lib/menu-lateral";
import { LogoTaguaro } from "./logo-taguaro";

const CHAVE_MENU = "taguaro.menu-lateral.v2";

function lerAbertos(): Record<string, boolean> {
  try {
    const bruto = localStorage.getItem(CHAVE_MENU);
    if (!bruto) return {};
    const valor = JSON.parse(bruto) as unknown;
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
    const abertos: Record<string, boolean> = {};
    for (const [chave, item] of Object.entries(valor)) {
      if (item === true) abertos[chave] = true;
    }
    return abertos;
  } catch {
    return {};
  }
}

export function BarraLateral({
  nome,
  email,
  nomeEmpresa,
  mostrarUsuarios,
  mostrarFaturas,
  mostrarRegua,
  mostrarAssessor,
  mostrarAsaas,
  mostrarAdmin,
}: {
  nome: string;
  email: string;
  nomeEmpresa: string;
  mostrarUsuarios: boolean;
  mostrarFaturas: boolean;
  mostrarRegua: boolean;
  mostrarAssessor: boolean;
  mostrarAsaas: boolean;
  mostrarAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hash, setHash] = useState("");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const grupos = montarGruposMenu({
    mostrarUsuarios,
    mostrarFaturas,
    mostrarRegua,
    mostrarAssessor,
    mostrarAsaas,
  });

  const grupoAtual = idGrupoAtual(pathname, hash, grupos);

  useEffect(() => {
    const lerHash = () => setHash(window.location.hash);
    lerHash();
    window.addEventListener("hashchange", lerHash);
    return () => window.removeEventListener("hashchange", lerHash);
  }, [pathname]);

  useEffect(() => {
    setAbertos(lerAbertos());
  }, []);

  function alternar(id: string) {
    setAbertos((atual) => {
      const proximo = { ...atual, [id]: !atual[id] };
      localStorage.setItem(CHAVE_MENU, JSON.stringify(proximo));
      return proximo;
    });
  }

  function tituloGrupo(id: string, titulo: string, tom: "grupo" | "plataforma") {
    const aberto = abertos[id] === true;
    const atual = id === grupoAtual;
    const cor =
      tom === "plataforma"
        ? "text-gold"
        : atual
          ? "text-white"
          : "text-white/55";
    return (
      <button
        type="button"
        className={`flex w-full cursor-pointer items-center justify-between px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${cor}`}
        aria-expanded={aberto}
        aria-controls={`grupo-${id}`}
        onClick={() => alternar(id)}
      >
        <span className="flex items-center gap-2">
          {atual ? <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" /> : null}
          {titulo}
          {atual ? <span className="sr-only">Página atual neste grupo.</span> : null}
        </span>
        <span aria-hidden="true">{aberto ? "–" : "+"}</span>
      </button>
    );
  }

  async function sair() {
    await enviarJson("/api/auth/sair", "POST");
    router.push("/login");
    router.refresh();
  }

  function linkItem(item: ItemMenu) {
    const ligado = itemAtivo(pathname, hash, item.href);
    const ancora = item.href.includes("#") ? `#${item.href.split("#")[1]}` : "";
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={ligado ? "page" : undefined}
        onClick={() => setHash(ancora)}
        className={`flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition ${
          ligado ? "bg-canopy text-white" : "text-white/90 hover:bg-white/10 hover:text-white"
        }`}
      >
        {item.rotulo}
      </Link>
    );
  }

  const navegacao = (
    <nav aria-label="Menu principal" className="flex max-h-[45vh] flex-col gap-4 overflow-y-auto md:max-h-none md:overflow-visible">
      {grupos.map((grupo) => {
        const aberto = abertos[grupo.id] === true;
        return (
          <div key={grupo.id}>
            {tituloGrupo(grupo.id, grupo.titulo, "grupo")}
            {aberto ? (
              <div id={`grupo-${grupo.id}`} className="grid gap-1">
                {grupo.itens.map(linkItem)}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  const plataformaAberta = abertos.plataforma === true;
  const plataforma = mostrarAdmin ? (
    <div className="rounded-2xl border border-gold/40 bg-black/25 p-2">
      {tituloGrupo("plataforma", "Plataforma", "plataforma")}
      {plataformaAberta ? (
        <div id="grupo-plataforma" className="grid gap-1">
          {linkItem({ href: "/admin", rotulo: "Empresas" })}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 grid-rows-[auto_minmax(0,1fr)_auto] bg-forest-deep text-paper md:grid">
        <div className="px-6 pt-6">
          <Link href="/" className="block">
            <LogoTaguaro tom="escuro" />
            <span className="mt-3 block text-sm text-white/65">{nomeEmpresa}</span>
          </Link>
        </div>
        <div className="overflow-y-auto px-4 py-6">{navegacao}</div>
        <div className="border-t border-white/10 px-4 py-4">
          {plataforma ? <div className="mb-4">{plataforma}</div> : null}
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-white/80">{email}</p>
          <button
            type="button"
            onClick={sair}
            className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-line bg-forest-deep text-paper md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="block">
            <LogoTaguaro tom="escuro" compacto />
          </Link>
          <button type="button" onClick={sair} className="min-h-11 cursor-pointer rounded-full px-3 text-sm font-medium text-white">
            Sair
          </button>
        </div>
        <div className="space-y-3 px-4 pb-3">
          {navegacao}
          {plataforma}
        </div>
      </div>
    </>
  );
}
