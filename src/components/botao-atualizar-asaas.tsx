"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { ResultadoAtualizacaoAsaas } from "@/lib/tipos";
import { classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

function textoResultado(dados: ResultadoAtualizacaoAsaas) {
  const partes: string[] = [];
  if (dados.atualizadas === 0) partes.push("Nenhuma fatura atualizada.");
  else if (dados.atualizadas === 1) partes.push("1 fatura atualizada.");
  else partes.push(`${dados.atualizadas} faturas atualizadas.`);
  if (dados.interrompida) {
    partes.push("A consulta parou antes do fim. O que já foi gravado continua. Tente de novo daqui a pouco.");
  } else if (dados.restantes > 0) {
    partes.push("A rotina diária segue com as outras faturas em aberto.");
  }
  return partes.join(" ");
}

export function BotaoAtualizarAsaas() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function atualizar() {
    setEnviando(true);
    const resposta = await enviarJson<ResultadoAtualizacaoAsaas>("/api/faturas/visualizacoes", "POST");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(textoResultado(resposta.dados));
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void atualizar()}>
        {enviando ? "Atualizando..." : "Atualizar com o Asaas"}
      </button>
    </div>
  );
}
