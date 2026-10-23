"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { classeBotaoPerigo, classeBotaoSecundario } from "./estilos";

export function BotaoCancelarFatura({ id }: { id: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/faturas/${id}`, "DELETE");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={classeBotaoPerigo} onClick={() => setAberto(true)}>
        Cancelar
      </button>
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-cancelar-fatura" className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
            <h2 id="titulo-cancelar-fatura" className="font-display text-2xl">
              Cancelar cobrança
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              A cobrança deixa de poder ser paga no Asaas. Isso não estorna um valor que já entrou.
            </p>
            {erro ? <p className="mt-3 text-sm text-clay">{erro}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className={classeBotaoSecundario} onClick={() => setAberto(false)} disabled={enviando}>
                Voltar
              </button>
              <button type="button" className={classeBotaoPerigo} onClick={confirmar} disabled={enviando}>
                {enviando ? "Cancelando..." : "Cancelar cobrança"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
