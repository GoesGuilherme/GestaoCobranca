"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioRespostaWhatsapp({
  telefone,
  bloqueado,
  aviso,
}: {
  telefone: string;
  bloqueado: boolean;
  aviso: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (bloqueado || enviando || !texto.trim()) return;
    setEnviando(true);
    const resposta = await enviarJson("/api/mensagens/responder", "POST", { telefone, texto: texto.trim() });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    setTexto("");
    avisarSucesso("Resposta enviada.");
    router.refresh();
  }

  if (bloqueado) {
    return (
      <div className="rounded-2xl border border-line bg-sand/60 p-4" role="status">
        <p className="text-sm leading-6 text-ink">{aviso}</p>
        <label className="mt-3 grid gap-1 text-sm">
          <span className="font-medium text-muted">Texto livre bloqueado</span>
          <textarea
            className={classeCampo}
            rows={3}
            disabled
            value=""
            readOnly
            aria-disabled="true"
            placeholder="Só um modelo aprovado pode sair fora da janela de 24 horas."
          />
        </label>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-2xl border border-line bg-card p-4">
      <label className="grid gap-1 text-sm" htmlFor={`resposta-${telefone}`}>
        <span className="font-medium">Responder em texto livre</span>
        <textarea
          id={`resposta-${telefone}`}
          className={classeCampo}
          rows={3}
          maxLength={1000}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Escreva a resposta. Ela só sai quando você clicar em Enviar resposta."
        />
      </label>
      <p className="mt-2 text-xs text-muted">A janela de 24 horas está aberta. Nada é enviado sozinho.</p>
      <button type="submit" className={`${classeBotaoPrimario} mt-3`} disabled={enviando || texto.trim().length === 0}>
        {enviando ? "Enviando..." : "Enviar resposta"}
      </button>
    </form>
  );
}
