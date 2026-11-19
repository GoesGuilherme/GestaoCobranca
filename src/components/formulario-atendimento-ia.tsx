"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { atendimentoIaAlterado, type ConfiguracaoAtendimentoIaDTO } from "@/lib/atendimento-ia";
import { Campo } from "./campo";
import { classeBotaoPrimario, classeCampo } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function FormularioAtendimentoIa({ inicial }: { inicial: ConfiguracaoAtendimentoIaDTO }) {
  const router = useRouter();
  const [gravado, setGravado] = useState(inicial);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);
  const [textoRepasse, setTextoRepasse] = useState(inicial.textoRepasse);
  const [enviando, setEnviando] = useState(false);
  const atual = { ativo, instrucoes, textoRepasse };
  const podeSalvar = atendimentoIaAlterado(atual, gravado);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeSalvar) return;
    setEnviando(true);
    const resposta = await enviarJson<{ atendimento: ConfiguracaoAtendimentoIaDTO }>(
      "/api/telefones/atendimento-ia",
      "PATCH",
      atual,
    );
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    setGravado(resposta.dados.atendimento);
    setAtivo(resposta.dados.atendimento.ativo);
    setInstrucoes(resposta.dados.atendimento.instrucoes);
    setTextoRepasse(resposta.dados.atendimento.textoRepasse);
    avisarSucesso("Atendimento por IA salvo");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="mt-6 max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Atendimento por IA</h2>
      <p className="text-sm leading-6 text-muted">
        Desligado por padrão. Quando ligado, uma mensagem de texto livre pode receber resposta sobre faturas em aberto,
        segunda via e promessa de pagamento. O botão Registrar promessa da cobrança continua valendo primeiro. Salvar não
        envia mensagem.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium" htmlFor="atendimento-ia-ativo">
        <input
          id="atendimento-ia-ativo"
          type="checkbox"
          checked={ativo}
          onChange={(evento) => setAtivo(evento.target.checked)}
        />
        Atendimento por IA
      </label>
      <Campo
        label="Instruções e tom de voz"
        htmlFor="atendimento-ia-instrucoes"
        dica="Até 1500 caracteres. Não libera desconto nem dado de outro cliente."
      >
        <textarea
          id="atendimento-ia-instrucoes"
          className={`${classeCampo} min-h-28`}
          maxLength={1500}
          value={instrucoes}
          onChange={(evento) => setInstrucoes(evento.target.value)}
        />
      </Campo>
      <Campo
        label="Texto de contato no repasse"
        htmlFor="atendimento-ia-repasse"
        dica="Entra na mensagem quando a conversa vai para uma pessoa. Até 500 caracteres."
      >
        <textarea
          id="atendimento-ia-repasse"
          className={`${classeCampo} min-h-20`}
          maxLength={500}
          value={textoRepasse}
          onChange={(evento) => setTextoRepasse(evento.target.value)}
        />
      </Campo>
      <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeSalvar}>
        {enviando ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
