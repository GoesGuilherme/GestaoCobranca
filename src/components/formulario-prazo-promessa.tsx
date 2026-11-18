"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { salvarPrazoPromessaHabilitado } from "@/lib/whatsapp-promessa";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioPrazoPromessa({ prazoDias }: { prazoDias: number }) {
  const router = useRouter();
  const [texto, setTexto] = useState(String(prazoDias));
  const [gravado, setGravado] = useState(prazoDias);
  const [enviando, setEnviando] = useState(false);
  const podeSalvar = salvarPrazoPromessaHabilitado(texto, gravado);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeSalvar) return;
    const prazoMaximoDias = Number(texto.trim());
    setEnviando(true);
    const resposta = await enviarJson<{ ajuste: { prazoMaximoDias: number } }>("/api/empresa/promessas/prazo", "PATCH", {
      prazoMaximoDias,
    });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    const salvo = resposta.dados.ajuste.prazoMaximoDias;
    setGravado(salvo);
    setTexto(String(salvo));
    avisarSucesso("Prazo da promessa salvo");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="mt-6 max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Prazo da promessa no WhatsApp</h2>
      <p className="text-sm leading-6 text-muted">
        O cliente que tocar no botão da cobrança só pode prometer uma data dentro deste prazo. O padrão é 15 dias.
        Uma data depois disso é recusada. A tela da empresa, usada por alguém da equipe, não usa este teto.
      </p>
      <Campo label="Prazo máximo em dias" htmlFor="prazo-promessa" dica="De 1 a 90 dias." obrigatorio>
        <input
          id="prazo-promessa"
          className={classeCampo}
          inputMode="numeric"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
        />
      </Campo>
      <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeSalvar}>
        {enviando ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
