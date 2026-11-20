"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { rotuloAlertaComprovante } from "@/lib/comprovante";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import type { ComprovanteDTO } from "@/server/services/comprovante-service";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function DialogoComprovante({
  comprovante,
  aberto,
  onFechar,
}: {
  comprovante: ComprovanteDTO;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const podeRejeitar = motivo.trim().length > 0;
  const podeConfirmar = comprovante.situacao === "PENDENTE" && Boolean(comprovante.faturaId);

  if (!aberto) return null;

  async function confirmar() {
    if (enviando || !podeConfirmar) return;
    setEnviando(true);
    const resposta = await enviarJson(`/api/comprovantes/${comprovante.id}/confirmar`, "POST", {});
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    onFechar();
    avisarSucesso("Baixa confirmada a partir do comprovante.");
    router.refresh();
  }

  async function rejeitar() {
    if (enviando || !podeRejeitar) return;
    setEnviando(true);
    const resposta = await enviarJson(`/api/comprovantes/${comprovante.id}/rejeitar`, "POST", { motivo });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    onFechar();
    avisarSucesso("Comprovante rejeitado. A fatura volta a cobrar.");
    router.refresh();
  }

  const imagem = comprovante.mime.startsWith("image/");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/50 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby={`titulo-comprovante-${comprovante.id}`} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-xl">
        <h2 id={`titulo-comprovante-${comprovante.id}`} className="font-display text-2xl">
          Conferir comprovante
        </h2>
        <p className="mt-2 text-sm text-muted">
          Confira se o dinheiro entrou na conta antes de dar a baixa. Nada é liquidado sozinho.
        </p>
        <div className="mt-4">
          {imagem ? (
            // A rota exige a sessão da empresa. Não é uma URL pública.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={comprovante.caminho} alt="Comprovante enviado pelo cliente" className="max-h-64 w-full rounded-2xl object-contain bg-sand" />
          ) : (
            <a href={comprovante.caminho} className="text-sm font-medium text-canopy hover:underline">
              Abrir PDF do comprovante
            </a>
          )}
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">Valor</dt><dd>{comprovante.valorExtraido ? formatarReais(comprovante.valorExtraido) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Data</dt><dd>{comprovante.pagoEm ? formatarDataIso(comprovante.pagoEm) : "—"}{comprovante.hora ? ` ${comprovante.hora}` : ""}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Pagador</dt><dd className="text-right">{comprovante.pagador ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Recebedor</dt><dd className="text-right">{comprovante.recebedorNome ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">ID da transação</dt><dd className="break-all text-right">{comprovante.e2e ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Fatura</dt><dd className="text-right">{comprovante.nomeCliente ? `${comprovante.nomeCliente}${comprovante.valorFatura ? ` · ${formatarReais(comprovante.valorFatura)}` : ""}` : "Não identificada"}</dd></div>
        </dl>
        {comprovante.alertas.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {comprovante.alertas.map((alerta) => (
              <li key={alerta} className="rounded-2xl bg-gold-soft px-3 py-2 text-sm text-gold-ink">
                {rotuloAlertaComprovante(alerta)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4">
          <Campo label="Motivo da rejeição" htmlFor={`motivo-${comprovante.id}`}>
            <input id={`motivo-${comprovante.id}`} className={classeCampo} value={motivo} maxLength={500} onChange={(evento) => setMotivo(evento.target.value)} />
          </Campo>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" className={classeBotaoSecundario} onClick={onFechar} disabled={enviando}>
            Fechar
          </button>
          <button type="button" className={classeBotaoSecundario} onClick={() => void rejeitar()} disabled={enviando || !podeRejeitar}>
            Rejeitar
          </button>
          <button type="button" className={classeBotaoPrimario} onClick={() => void confirmar()} disabled={enviando || !podeConfirmar}>
            {enviando ? "Salvando..." : "Confirmar baixa"}
          </button>
        </div>
      </div>
    </div>
  );
}
