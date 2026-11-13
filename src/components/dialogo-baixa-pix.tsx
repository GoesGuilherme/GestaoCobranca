"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { dataHojeIso } from "@/lib/data";
import { confirmarBaixaHabilitado } from "@/lib/pix-formulario";
import type { FaturaDTO } from "@/lib/tipos";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function DialogoBaixaPix({
  fatura,
  aberto,
  onFechar,
}: {
  fatura: Pick<FaturaDTO, "id" | "nomeCliente" | "valor">;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [pagoEm, setPagoEm] = useState(dataHojeIso());
  const [nota, setNota] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const podeConfirmar = confirmarBaixaHabilitado(pagoEm, confirmado);

  if (!aberto) return null;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeConfirmar) return;
    setEnviando(true);
    const resposta = await enviarJson<{ fatura: FaturaDTO }>(`/api/faturas/${fatura.id}/pago`, "POST", {
      pagoEm,
      nota,
      confirmar: true,
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
    avisarSucesso("Cobrança marcada como paga");
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
          Marcar como pago
        </h2>
        <p className="mt-2 text-sm text-muted">
          O Pix da empresa não avisa o Taguaro quando o cliente paga. Confirme só depois de ver o crédito na conta de{" "}
          {fatura.nomeCliente}.
        </p>
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
              checked={confirmado}
              onChange={(evento) => setConfirmado(evento.target.checked)}
            />
            <span>Confirmo que o Pix de {fatura.valor} foi recebido na chave da empresa.</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={classeBotaoSecundario} onClick={onFechar} disabled={enviando}>
            Voltar
          </button>
          <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeConfirmar}>
            {enviando ? "Salvando..." : "Confirmar pagamento"}
          </button>
        </div>
      </form>
    </div>
  );
}
