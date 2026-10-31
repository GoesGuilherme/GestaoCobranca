"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { ResultadoVisualizacoesFaturas } from "@/lib/tipos";
import { classeBotaoSecundario } from "./estilos";

function textoResultado(dados: ResultadoVisualizacoesFaturas) {
  const partes: string[] = [];
  if (dados.marcadas === 0) partes.push("Nenhuma visualização nova.");
  else if (dados.marcadas === 1) partes.push("1 fatura marcada como visualizada.");
  else partes.push(`${dados.marcadas} faturas marcadas como visualizadas.`);
  if (dados.interrompida) {
    partes.push("A consulta parou antes do fim. O que já foi marcado continua marcado. Tente de novo daqui a pouco.");
  } else if (dados.restantes > 0) {
    partes.push("Ainda há faturas para consultar. Clique de novo, ou espere a rotina diária.");
  }
  if (dados.falhas > 0 && !dados.interrompida) {
    partes.push("Algumas consultas falharam e ficam para a próxima.");
  }
  return partes.join(" ");
}

export function BotaoAtualizarVisualizacoes() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function atualizar() {
    setEnviando(true);
    setErro("");
    setMensagem("");
    const resposta = await enviarJson<ResultadoVisualizacoesFaturas>("/api/faturas/visualizacoes", "POST");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    setMensagem(textoResultado(resposta.dados));
    router.refresh();
  }

  return (
    <div>
      <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void atualizar()}>
        {enviando ? "Atualizando..." : "Atualizar visualizações"}
      </button>
      {mensagem ? <p role="status" className="mt-3 text-sm text-ok">{mensagem}</p> : null}
      {erro ? (
        <div role="alert" className="mt-3 rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay">
          <p className="font-medium">Não foi possível consultar o Asaas.</p>
          <p className="mt-1">{erro}</p>
        </div>
      ) : null}
    </div>
  );
}
