"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { StatusEmpresa } from "@/lib/tipos";
import { classeBotaoPerigo, classeBotaoSecundario } from "./estilos";

export function BotaoStatusEmpresa({
  empresaId,
  status,
  propria,
}: {
  empresaId: string;
  status: StatusEmpresa;
  propria: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const suspender = status === "ATIVA";

  async function alterar() {
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/admin/empresas/${empresaId}`, "PATCH", {
      status: suspender ? "SUSPENSA" : "ATIVA",
    });
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    router.refresh();
  }

  if (propria && suspender) {
    return <span className="text-xs text-muted">Sua empresa</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={alterar}
        disabled={enviando}
        className={suspender ? classeBotaoPerigo : classeBotaoSecundario}
      >
        {enviando ? "Salvando..." : suspender ? "Suspender" : "Reativar"}
      </button>
      {erro ? <p className="mt-1 text-xs text-clay">{erro}</p> : null}
    </div>
  );
}
