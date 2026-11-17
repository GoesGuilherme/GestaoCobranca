"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { opcaoPorId, type OpcaoCobranca, type PainelFormasCobranca } from "@/lib/formas-cobranca";
import { Campo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { SeletorFormaCobranca } from "./seletor-forma-cobranca";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioFormaPadrao({ inicial }: { inicial: PainelFormasCobranca }) {
  const router = useRouter();
  const [opcoes, setOpcoes] = useState<OpcaoCobranca[]>(inicial.opcoes);
  const [gravado, setGravado] = useState(inicial.padraoId);
  const [escolha, setEscolha] = useState(inicial.padraoDisponivel ? inicial.padraoId : (inicial.opcoes[0]?.id ?? ""));
  const [enviando, setEnviando] = useState(false);
  const opcao = opcaoPorId(escolha, opcoes);
  const podeSalvar = Boolean(opcao) && escolha !== gravado;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeSalvar) return;
    setEnviando(true);
    const resposta = await enviarJson<{ formas: PainelFormasCobranca }>("/api/banco/forma-padrao", "POST", { opcaoId: escolha });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    setOpcoes(resposta.dados.formas.opcoes);
    setGravado(resposta.dados.formas.padraoId);
    setEscolha(resposta.dados.formas.padraoId);
    avisarSucesso("Forma padrão salva");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="grid gap-4 rounded-3xl border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-2xl">Forma padrão de cobrança</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Vale para a cobrança nova quando ninguém escolhe outra. Cada cobrança avulsa e cada recorrência ainda pode usar
          outra forma disponível. O que já foi emitido continua no provedor da própria fatura.
        </p>
      </div>
      {!inicial.padraoDisponivel && gravado ? (
        <p className="rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm leading-6">
          A forma padrão gravada não está disponível agora. Escolha outra e salve para trocar. Nada muda até o Salvar.
        </p>
      ) : null}
      <Campo label="Forma padrão" htmlFor="forma-padrao">
        <SeletorFormaCobranca id="forma-padrao" valor={escolha} opcoes={opcoes} onChange={setEscolha} />
      </Campo>
      {opcoes.length === 0 ? (
        <p className="text-sm text-muted">Cadastre a chave Pix ou conecte Asaas, Cora ou Inter para escolher a forma padrão.</p>
      ) : null}
      <div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeSalvar}>
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
