"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { rotuloAtribuicao } from "@/lib/regua";
import type { AtribuicaoReguaDTO, ModoReguaCliente, ReguaDTO } from "@/lib/tipos";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

export function PainelReguaCliente({
  clienteId,
  modo,
  reguaId,
  pausada,
  nome,
  reguas,
  podeEditar,
}: {
  clienteId: string;
  modo: ModoReguaCliente;
  reguaId: string | null;
  pausada: boolean;
  nome: string | null;
  reguas: { id: string; nome: string; padrao: boolean }[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [escolha, setEscolha] = useState(modo === "ESPECIFICA" && reguaId ? reguaId : modo);
  const [pausadaLocal, setPausadaLocal] = useState(pausada);
  const [nomeLocal, setNomeLocal] = useState(nome);
  const [modoLocal, setModoLocal] = useState(modo);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEditar) return;
    setErro("");
    setAviso("");
    const modoEnvio: ModoReguaCliente = escolha === "PADRAO" || escolha === "NENHUMA" ? escolha : "ESPECIFICA";
    const corpo = {
      modo: modoEnvio,
      reguaId: modoEnvio === "ESPECIFICA" ? escolha : null,
      pausada: pausadaLocal,
    };
    setEnviando(true);
    const resposta = await enviarJson<{ atribuicao: AtribuicaoReguaDTO }>(`/api/clientes/${clienteId}/regua`, "PATCH", corpo);
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    setModoLocal(resposta.dados.atribuicao.modo);
    setNomeLocal(resposta.dados.atribuicao.nome);
    setAviso("Régua do cliente salva.");
    router.refresh();
  }

  const reguasNomeadas: Pick<ReguaDTO, "id" | "nome" | "padrao">[] = reguas;

  return (
    <section className="mt-10 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-3xl">Régua de cobrança</h2>
      <p id="cliente-regua-rotulo" className="mt-2 text-sm font-medium">
        {rotuloAtribuicao({ pausada: pausadaLocal, nome: modoLocal === "NENHUMA" ? null : nomeLocal })}
      </p>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        A padrão da empresa vale para quem não tem outra. Nenhuma tira o cliente da régua. Pausar guarda a escolha e volta nela quando soltar.
      </p>
      {podeEditar ? (
        <form className="mt-4 grid gap-4" onSubmit={salvar}>
          <Campo label="Régua deste cliente" htmlFor="cliente-regua-modo">
            <select
              id="cliente-regua-modo"
              className={classeCampo}
              value={escolha}
              onChange={(evento) => setEscolha(evento.target.value)}
            >
              <option value="PADRAO">Padrão da empresa{reguasNomeadas.find((item) => item.padrao) ? ` (${reguasNomeadas.find((item) => item.padrao)?.nome})` : ""}</option>
              {reguasNomeadas.map((regua) => (
                <option key={regua.id} value={regua.id}>
                  {regua.nome}
                </option>
              ))}
              <option value="NENHUMA">Nenhuma</option>
            </select>
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="cliente-regua-pausada"
              type="checkbox"
              checked={pausadaLocal}
              onChange={(evento) => setPausadaLocal(evento.target.checked)}
            />
            Pausar a régua deste cliente
          </label>
          {erro ? <p className="text-sm text-clay">{erro}</p> : null}
          {aviso ? <p className="text-sm text-canopy">{aviso}</p> : null}
          <div>
            <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar régua do cliente"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
