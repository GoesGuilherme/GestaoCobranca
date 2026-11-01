"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { textoImportacaoFaturas } from "@/lib/textos-feedback";
import type { ResultadoImportacaoFaturas } from "@/lib/tipos";
import { classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function BotaoImportarFaturas() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function importar() {
    setEnviando(true);
    const resposta = await enviarJson<ResultadoImportacaoFaturas>("/api/faturas/importar", "POST");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    const { criadas, atualizadas, ignoradas } = resposta.dados;
    avisarSucesso(textoImportacaoFaturas(criadas, atualizadas, ignoradas));
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void importar()}>
        {enviando ? "Importando..." : "Importar faturas"}
      </button>
    </div>
  );
}
