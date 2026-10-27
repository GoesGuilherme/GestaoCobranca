"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { formatarData } from "@/lib/formatacao";
import type { OpcaoPassoRegua } from "@/lib/regua";
import type { LembreteReguaDTO, StatusLembrete } from "@/lib/tipos";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

function rotuloStatus(status: StatusLembrete) {
  if (status === "ENVIADO") return "Enviado";
  if (status === "FALHOU") return "Falhou";
  return "Ignorado";
}

function rotuloCanal(canal: string) {
  return canal === "EMAIL" ? "E-mail" : canal;
}

export function AcoesLembrete({
  faturaId,
  lembretes,
  passos,
  podeEnviar,
  modoTeste = false,
  emailCliente = "",
  emailLogado = "",
}: {
  faturaId: string;
  lembretes: LembreteReguaDTO[];
  passos: OpcaoPassoRegua[];
  podeEnviar: boolean;
  modoTeste?: boolean;
  emailCliente?: string;
  emailLogado?: string;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(lembretes);
  const [aberto, setAberto] = useState(false);
  const [passoId, setPassoId] = useState(passos[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function abrir() {
    setPassoId(passos[0]?.id ?? "");
    setErro("");
    setAberto(true);
  }

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setErro("");
  }

  async function confirmar() {
    if (!passoId) return;
    setErro("");
    setEnviando(true);
    const resposta = await enviarJson<{ lembrete: LembreteReguaDTO }>(`/api/faturas/${faturaId}/lembretes`, "POST", { passoId });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    setLista((atual) => [resposta.dados.lembrete, ...atual]);
    setAberto(false);
    router.refresh();
  }

  const destinatario = modoTeste ? emailLogado : emailCliente;

  return (
    <div className="mt-3 max-w-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Lembretes</p>
      {lista.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Nenhum lembrete desta cobrança.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs text-muted">
          {lista.map((lembrete) => (
            <li key={lembrete.id}>
              {lembrete.rotulo} · {lembrete.canal === "EMAIL" ? "E-mail" : lembrete.canal} · {formatarData(lembrete.criadoEm)} · {rotuloStatus(lembrete.status)}
              {lembrete.modoTeste ? " · teste" : ""}
              {lembrete.destino ? ` · ${lembrete.destino}` : ""}
              {lembrete.motivo ? ` · ${lembrete.motivo}` : ""}
              {lembrete.automatico ? "" : " · manual"}
            </li>
          ))}
        </ul>
      )}
      {podeEnviar && passos.length > 0 ? (
        <button type="button" className={`${classeBotaoSecundario} mt-2`} onClick={abrir}>
          Enviar lembrete
        </button>
      ) : null}
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`titulo-lembrete-${faturaId}`}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-6 shadow-xl"
          >
            <h2 id={`titulo-lembrete-${faturaId}`} className="font-display text-2xl">
              Enviar lembrete
            </h2>
            <p className="mt-2 text-sm text-muted">Qual lembrete desta régua enviar?</p>
            <fieldset className="mt-4 grid gap-2">
              <legend className="sr-only">Passo da régua</legend>
              {passos.map((passo) => (
                <label key={passo.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-3 py-2">
                  <input
                    type="radio"
                    name={`lembrete-${faturaId}`}
                    className="mt-1"
                    checked={passoId === passo.id}
                    onChange={() => setPassoId(passo.id)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{passo.rotulo}</span>
                    <span className="block text-xs text-muted">Canal: {rotuloCanal(passo.canal)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mt-4 text-sm leading-6">
              {modoTeste
                ? `Modo teste ligado. Este envio não vai para o cliente. Vai para quem está logado${emailLogado ? ` (${emailLogado})` : ""}. O envio diário da régua vai só para o dono.`
                : `Destinatário: ${destinatario || "o cliente não tem e-mail"}.`}
            </p>
            {erro ? <p className="mt-3 text-sm text-clay">{erro}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className={classeBotaoSecundario} onClick={fechar} disabled={enviando}>
                Cancelar
              </button>
              <button type="button" className={classeBotaoPrimario} onClick={() => void confirmar()} disabled={enviando || !passoId}>
                {enviando ? "Enviando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
