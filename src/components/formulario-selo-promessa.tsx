"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { classeBotaoPrimario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioSeloPromessa({ ligado }: { ligado: boolean }) {
  const router = useRouter();
  const [contar, setContar] = useState(ligado);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const resposta = await enviarJson("/api/empresa/promessas", "PATCH", { contarNoSelo: contar });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(contar ? "Promessa quebrada passa a contar no selo" : "Promessa quebrada deixou de contar no selo");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="mt-6 max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Selo de pagador</h2>
      <p className="text-sm leading-6 text-muted">
        Desligado por padrão. Se ligar, uma promessa quebrada nos últimos 12 meses impede o selo de bom pagador.
        Duas ou mais classificam como mau pagador. Promessa cumprida, cumprida com atraso ou cancelada não entra.
        Sem histórico suficiente de faturas, o cliente continua sem selo.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={contar}
          onChange={(evento) => setContar(evento.target.checked)}
        />
        <span>Contar promessas quebradas no selo de pagador</span>
      </label>
      <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar regra do selo"}
      </button>
    </form>
  );
}
