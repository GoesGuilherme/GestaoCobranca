"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { formatarDataIso } from "@/lib/formatacao";
import { classeBotaoPerigo, classeBotaoSecundario } from "./estilos";

export function BotaoCancelarFatura({
  id,
  recorrencia = null,
}: {
  id: string;
  recorrencia?: { vinculoId: string; proximoVencimento: string | null } | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<"fatura" | "recorrencia">("fatura");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setEtapa("fatura");
    setErro("");
  }

  async function confirmarFatura() {
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
    setEtapa("fatura");
    router.refresh();
  }

  async function confirmarRecorrencia() {
    if (!recorrencia) return;
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${recorrencia.vinculoId}/recorrencia`, "DELETE");
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
    setEtapa("fatura");
    router.refresh();
  }

  const avisoRecorrencia = recorrencia
    ? recorrencia.proximoVencimento
      ? `Esta fatura é de uma recorrência ativa. A recorrência continua e gera a próxima em ${formatarDataIso(recorrencia.proximoVencimento)}.`
      : "Esta fatura é de uma recorrência ativa. A recorrência continua."
    : "";

  return (
    <>
      <button type="button" className={classeBotaoPerigo} onClick={() => setAberto(true)}>
        Cancelar
      </button>
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-cancelar-fatura" className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
            {etapa === "recorrencia" ? (
              <>
                <h2 id="titulo-cancelar-fatura" className="font-display text-2xl">
                  Cancelar recorrência
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Cancelar remove a assinatura no Asaas e as cobranças em aberto desta recorrência.
                </p>
                {erro ? <p className="mt-3 text-sm text-clay">{erro}</p> : null}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" className={classeBotaoSecundario} onClick={() => setEtapa("fatura")} disabled={enviando}>
                    Voltar
                  </button>
                  <button type="button" className={classeBotaoPerigo} onClick={() => void confirmarRecorrencia()} disabled={enviando}>
                    {enviando ? "Cancelando..." : "Confirmar cancelamento"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="titulo-cancelar-fatura" className="font-display text-2xl">
                  Cancelar cobrança
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  A cobrança deixa de poder ser paga no Asaas. Isso não estorna um valor que já entrou.
                </p>
                {avisoRecorrencia ? <p className="mt-3 text-sm leading-6">{avisoRecorrencia}</p> : null}
                {recorrencia ? (
                  <button type="button" className="mt-3 text-sm font-medium text-clay underline" onClick={() => setEtapa("recorrencia")}>
                    Cancelar a recorrência
                  </button>
                ) : null}
                {erro ? <p className="mt-3 text-sm text-clay">{erro}</p> : null}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" className={classeBotaoSecundario} onClick={fechar} disabled={enviando}>
                    Voltar
                  </button>
                  <button type="button" className={classeBotaoPerigo} onClick={() => void confirmarFatura()} disabled={enviando}>
                    {enviando ? "Cancelando..." : "Cancelar cobrança"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
