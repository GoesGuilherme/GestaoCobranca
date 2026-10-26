"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { formatarData } from "@/lib/formatacao";
import type { LembreteReguaDTO, StatusLembrete } from "@/lib/tipos";
import { classeCampo } from "./campo";
import { classeBotaoSecundario } from "./estilos";

function rotuloStatus(status: StatusLembrete) {
  if (status === "ENVIADO") return "Enviado";
  if (status === "FALHOU") return "Falhou";
  return "Ignorado";
}

export function AcoesLembrete({
  faturaId,
  lembretes,
  passos,
  podeEnviar,
}: {
  faturaId: string;
  lembretes: LembreteReguaDTO[];
  passos: { id: string; rotulo: string }[];
  podeEnviar: boolean;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(lembretes);
  const [passoId, setPassoId] = useState(passos[0]?.id ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
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
    router.refresh();
  }

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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            id={`lembrete-passo-${faturaId}`}
            aria-label="Passo para enviar agora"
            className={`${classeCampo} max-w-xs`}
            value={passoId}
            onChange={(evento) => setPassoId(evento.target.value)}
          >
            {passos.map((passo) => (
              <option key={passo.id} value={passo.id}>
                {passo.rotulo}
              </option>
            ))}
          </select>
          <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar agora"}
          </button>
        </div>
      ) : null}
      {erro ? <p className="mt-1 text-xs text-clay">{erro}</p> : null}
    </div>
  );
}
