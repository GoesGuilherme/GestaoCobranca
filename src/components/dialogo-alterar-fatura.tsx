"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import {
  AVISO_ALTERACAO_CORA,
  AVISO_ALTERACAO_PIX,
  salvarAlteracaoHabilitado,
  textoToastAlteracao,
} from "@/lib/alteracao-fatura";
import { formatarValorCampo } from "@/lib/dinheiro";
import { mascararMoedaDigitando } from "@/lib/mascaras";
import type { FaturaDTO, ResultadoAlteracaoFatura } from "@/lib/tipos";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function DialogoAlterarFatura({
  fatura,
  aberto,
  onFechar,
}: {
  fatura: Pick<FaturaDTO, "id" | "valor" | "vencimento" | "descricao" | "provedor" | "nomeCliente">;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(() => formatarValorCampo(fatura.valor));
  const [vencimento, setVencimento] = useState(fatura.vencimento);
  const [descricao, setDescricao] = useState(fatura.descricao ?? "");
  const [enviando, setEnviando] = useState(false);
  const atual = { valor: fatura.valor, vencimento: fatura.vencimento, descricao: fatura.descricao };
  const podeSalvar = salvarAlteracaoHabilitado({ valor, vencimento, descricao }, atual);
  const cora = fatura.provedor === "CORA";
  const pix = fatura.provedor === "PIX_DIRETO";

  if (!aberto) return null;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeSalvar) return;
    setEnviando(true);
    const resposta = await enviarJson<ResultadoAlteracaoFatura>(`/api/faturas/${fatura.id}`, "PATCH", {
      valor,
      vencimento,
      descricao,
    });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    onFechar();
    avisarSucesso(textoToastAlteracao(resposta.dados.reenvio, resposta.dados.reemitido, fatura.provedor));
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
      <form
        onSubmit={(evento) => void salvar(evento)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`titulo-alterar-${fatura.id}`}
        className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-xl"
      >
        <h2 id={`titulo-alterar-${fatura.id}`} className="font-display text-2xl">
          Alterar cobrança
        </h2>
        <p className="mt-2 text-sm text-muted">
          Vencimento, valor e descrição de {fatura.nomeCliente}. A forma de cobrança não muda.
        </p>
        {cora ? (
          <p className="mt-3 rounded-2xl bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-ink" role="note">
            {AVISO_ALTERACAO_CORA}
          </p>
        ) : null}
        {pix ? (
          <p className="mt-3 rounded-2xl bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-ink" role="note">
            {AVISO_ALTERACAO_PIX}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo label="Valor" htmlFor={`alterar-valor-${fatura.id}`} obrigatorio>
            <input
              id={`alterar-valor-${fatura.id}`}
              className={classeCampo}
              inputMode="decimal"
              value={valor}
              onChange={(evento) => setValor(mascararMoedaDigitando(evento.target.value))}
            />
          </Campo>
          <Campo label="Vencimento" htmlFor={`alterar-vencimento-${fatura.id}`} obrigatorio>
            <input
              id={`alterar-vencimento-${fatura.id}`}
              type="date"
              className={classeCampo}
              value={vencimento}
              onChange={(evento) => setVencimento(evento.target.value)}
            />
          </Campo>
        </div>
        <div className="mt-4">
          <Campo label="Descrição" htmlFor={`alterar-descricao-${fatura.id}`}>
            <input
              id={`alterar-descricao-${fatura.id}`}
              className={classeCampo}
              value={descricao}
              maxLength={500}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
          </Campo>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={classeBotaoSecundario} onClick={onFechar} disabled={enviando}>
            Voltar
          </button>
          <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeSalvar}>
            {enviando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
