"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { StatusEmpresa } from "@/lib/tipos";
import { classeBotaoPerigo, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

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
  const [enviando, setEnviando] = useState(false);
  const suspender = status === "ATIVA";

  async function alterar() {
    setEnviando(true);
    const resposta = await enviarJson(`/api/admin/empresas/${empresaId}`, "PATCH", {
      status: suspender ? "SUSPENSA" : "ATIVA",
    });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(suspender ? "Empresa suspensa" : "Empresa reativada");
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
    </div>
  );
}
