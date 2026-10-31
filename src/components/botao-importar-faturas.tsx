"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { textoImportacaoFaturas } from "@/lib/textos-feedback";
import type { ResultadoImportacaoFaturas } from "@/lib/tipos";
import { Aviso } from "./aviso";
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
    const { criadas, atualizadas, ignoradas } = resposta.dados;
    setMensagem(textoImportacaoFaturas(criadas, atualizadas, ignoradas));
    router.refresh();
  }

  return (
    <div className="mb-6">
      <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void importar()}>
        {enviando ? "Importando..." : "Importar faturas"}
      </button>
      {mensagem ? (
        <div className="mt-3">
          <Aviso tom="ok" titulo={mensagem} onFechar={() => setMensagem("")} />
        </div>
      ) : null}
      {erro ? (
        <div className="mt-3">
          <Aviso tom="erro" titulo="O Asaas não devolveu as faturas.">
            <p>{erro}</p>
          </Aviso>
        </div>
      ) : null}
    </div>
  );
}
