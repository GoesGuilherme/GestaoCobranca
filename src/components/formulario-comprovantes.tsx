"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { classeBotaoPrimario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioComprovantes({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(ativo);
  const [enviando, setEnviando] = useState(false);
  const mudou = ligado !== ativo;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !mudou) return;
    setEnviando(true);
    const resposta = await enviarJson("/api/empresa/comprovantes-whatsapp", "POST", { ativo: ligado });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(ligado ? "Leitura de comprovantes ligada." : "Leitura de comprovantes desligada.");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="mt-8 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Comprovantes</h2>
      <p className="mt-2 text-sm text-muted">
        Quando um cliente manda imagem ou PDF no WhatsApp, o Taguaro tenta ler se é um comprovante e deixa a sugestão para você conferir. Não dá baixa sozinho e não depende do atendimento por IA.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium" htmlFor="ler-comprovantes">
        <input
          id="ler-comprovantes"
          type="checkbox"
          checked={ligado}
          onChange={(evento) => setLigado(evento.target.checked)}
        />
        Ler comprovantes pelo WhatsApp
      </label>
      <div className="mt-4">
        <button type="submit" className={classeBotaoPrimario} disabled={enviando || !mudou}>
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
