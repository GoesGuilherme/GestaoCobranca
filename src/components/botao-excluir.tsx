"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { classeBotaoPerigo, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function BotaoExcluir({
  url,
  mensagem,
  rotulo = "Excluir",
  redirecionar,
  sucesso = "Excluído com sucesso",
}: {
  url: string;
  mensagem: string;
  rotulo?: string;
  redirecionar?: string;
  sucesso?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    const resposta = await enviarJson(url, "DELETE");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    setAberto(false);
    avisarSucesso(sucesso, redirecionar ? { aposNavegar: true } : undefined);
    if (redirecionar) {
      router.push(redirecionar);
    }
    router.refresh();
  }

  return (
    <>
      <button type="button" className={classeBotaoPerigo} onClick={() => setAberto(true)}>
        {rotulo}
      </button>
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-excluir"
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl"
          >
            <h2 id="titulo-excluir" className="font-display text-2xl">
              Confirmar exclusão
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">{mensagem}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className={classeBotaoSecundario}
                onClick={() => setAberto(false)}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button type="button" className={classeBotaoPerigo} onClick={confirmar} disabled={enviando}>
                {enviando ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
