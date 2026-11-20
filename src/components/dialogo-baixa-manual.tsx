"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import {
  avisoAntesDaBaixa,
  confirmarBaixaManualHabilitado,
  FORMAS_BAIXA,
  valorBaixaDiverge,
  type RascunhoBaixaManual,
} from "@/lib/baixa-manual";
import { dataHojeIso } from "@/lib/data";
import { formatarReais, formatarValorCampo } from "@/lib/dinheiro";
import { mascararMoedaDigitando } from "@/lib/mascaras";
import type { FaturaDTO } from "@/lib/tipos";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function DialogoBaixaManual({
  fatura,
  aberto,
  onFechar,
}: {
  fatura: Pick<FaturaDTO, "id" | "nomeCliente" | "valor" | "provedor">;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const inicial: RascunhoBaixaManual = {
    pagoEm: dataHojeIso(),
    valor: formatarValorCampo(fatura.valor),
    forma: "",
    nota: "",
    enviarConfirmacao: false,
  };
  const [pagoEm, setPagoEm] = useState(inicial.pagoEm);
  const [valor, setValor] = useState(inicial.valor);
  const [forma, setForma] = useState(inicial.forma);
  const [nota, setNota] = useState(inicial.nota);
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(inicial.enviarConfirmacao);
  const [enviando, setEnviando] = useState(false);
  const atual = { pagoEm, valor, forma, nota, enviarConfirmacao };
  const podeConfirmar = confirmarBaixaManualHabilitado(atual, inicial);
  const diverge = valorBaixaDiverge(valor, fatura.valor);
  const avisoBanco = avisoAntesDaBaixa(fatura.provedor);

  if (!aberto) return null;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeConfirmar) return;
    setEnviando(true);
    const resposta = await enviarJson<{ fatura: FaturaDTO; aviso: string | null }>(
      `/api/faturas/${fatura.id}/pago`,
      "POST",
      { pagoEm, valorRecebido: valor, forma, nota, enviarConfirmacao },
    );
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
    const aviso = resposta.dados.aviso;
    avisarSucesso(aviso ? `Baixa manual registrada. ${aviso}` : "Baixa manual registrada.");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
      <form
        onSubmit={(evento) => void salvar(evento)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`titulo-baixa-${fatura.id}`}
        className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-xl"
      >
        <h2 id={`titulo-baixa-${fatura.id}`} className="font-display text-2xl">
          Dar baixa manual
        </h2>
        <p className="mt-2 text-sm text-muted">
          Use quando {fatura.nomeCliente} pagou fora desta cobrança ({formatarReais(fatura.valor)}). A régua desta fatura
          para. As próximas faturas da recorrência não mudam.
        </p>
        {avisoBanco ? (
          <p className="mt-3 rounded-2xl bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-ink" role="note">
            {avisoBanco}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4">
          <Campo label="Data do pagamento" htmlFor={`pago-em-${fatura.id}`} obrigatorio>
            <input
              id={`pago-em-${fatura.id}`}
              type="date"
              className={classeCampo}
              value={pagoEm}
              max={dataHojeIso()}
              onChange={(evento) => setPagoEm(evento.target.value)}
            />
          </Campo>
          <Campo label="Valor recebido" htmlFor={`valor-baixa-${fatura.id}`} obrigatorio>
            <input
              id={`valor-baixa-${fatura.id}`}
              className={classeCampo}
              inputMode="decimal"
              value={valor}
              onChange={(evento) => setValor(mascararMoedaDigitando(evento.target.value))}
            />
          </Campo>
          {diverge ? (
            <p className="rounded-2xl bg-gold-soft px-3 py-2 text-sm leading-6 text-gold-ink" role="status">
              O valor recebido é diferente do valor da fatura ({formatarReais(fatura.valor)}). A baixa segue com o valor
              informado.
            </p>
          ) : null}
          <Campo label="Forma" htmlFor={`forma-baixa-${fatura.id}`} obrigatorio>
            <select
              id={`forma-baixa-${fatura.id}`}
              className={classeCampo}
              value={forma}
              onChange={(evento) => setForma(evento.target.value)}
            >
              <option value="">Escolha</option>
              {FORMAS_BAIXA.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Observação" htmlFor={`nota-baixa-${fatura.id}`} dica="Opcional. Não aparece para o cliente.">
            <input
              id={`nota-baixa-${fatura.id}`}
              className={classeCampo}
              value={nota}
              maxLength={500}
              onChange={(evento) => setNota(evento.target.value)}
            />
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={enviarConfirmacao}
              onChange={(evento) => setEnviarConfirmacao(evento.target.checked)}
            />
            <span>Enviar confirmação de pagamento ao cliente</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={classeBotaoSecundario} onClick={onFechar} disabled={enviando}>
            Voltar
          </button>
          <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeConfirmar}>
            {enviando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}
