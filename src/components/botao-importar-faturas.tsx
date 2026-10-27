"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { ResultadoImportacaoFaturas } from "@/lib/tipos";
import { classeBotaoSecundario } from "./estilos";

export function BotaoImportarFaturas() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function importar() {
    setEnviando(true);
    setErro("");
    setMensagem("");
    const resposta = await enviarJson<ResultadoImportacaoFaturas>("/api/faturas/importar", "POST");
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    const { criadas, atualizadas } = resposta.dados;
    setMensagem(
      criadas === 0 && atualizadas === 0
        ? "Nenhuma cobrança nova no Asaas para os clientes já vinculados."
        : `${criadas} fatura(s) nova(s). ${atualizadas} já estavam aqui e foram atualizadas.`,
    );
    router.refresh();
  }

  return (
    <div className="mb-6">
      <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void importar()}>
        {enviando ? "Importando..." : "Importar faturas"}
      </button>
      {mensagem ? <p role="status" className="mt-3 text-sm text-ok">{mensagem}</p> : null}
      {erro ? (
        <div role="alert" className="mt-3 rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay">
          <p className="font-medium">O Asaas não devolveu as faturas.</p>
          <p className="mt-1">{erro}</p>
        </div>
      ) : null}
    </div>
  );
}
