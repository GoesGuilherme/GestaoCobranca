"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import {
  LIMITE_REENVIO_BOLETOS,
  agruparMotivos,
  textoAjudaReenvio,
  textoConfirmacaoReenvio,
  textoResumoReenvio,
} from "@/lib/reenvio-boleto";
import type { ResultadoReenvioBoletos } from "@/lib/tipos";
import { DialogoConfirmacao } from "./dialogo-confirmacao";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro } from "./notificador";

function CaixaSelecao({
  id,
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: {
  id: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (marcado: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className="size-4 accent-forest disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      onChange={(evento) => onChange(evento.target.checked)}
    />
  );
}

export function BarraReenvioBoletos({
  ids,
  totalElegiveis,
  todasMarcadas,
  algumasMarcadas,
  foraDaPagina,
  modoTeste,
  emailLogado,
  onAlternarTodas,
  onConcluido,
}: {
  ids: string[];
  totalElegiveis: number;
  todasMarcadas: boolean;
  algumasMarcadas: boolean;
  foraDaPagina: number;
  modoTeste: boolean;
  emailLogado: string;
  onAlternarTodas: () => void;
  onConcluido: () => void;
}) {
  const router = useRouter();
  const caixaId = useId();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoReenvioBoletos | null>(null);
  const podeEnviar = ids.length > 0 && ids.length <= LIMITE_REENVIO_BOLETOS && !enviando;
  const ajuda = textoAjudaReenvio(totalElegiveis, ids.length, foraDaPagina);

  async function enviar() {
    setEnviando(true);
    const resposta = await enviarJson<ResultadoReenvioBoletos>("/api/faturas/reenviar-boletos", "POST", { ids });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    setConfirmar(false);
    setResultado(resposta.dados);
    onConcluido();
    router.refresh();
  }

  const grupos = resultado ? agruparMotivos(resultado.itens) : [];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <label htmlFor={caixaId} className="inline-flex items-center gap-2 text-sm font-medium">
        <CaixaSelecao
          id={caixaId}
          checked={todasMarcadas}
          indeterminate={algumasMarcadas}
          disabled={totalElegiveis === 0 || enviando}
          onChange={() => onAlternarTodas()}
        />
        Selecionar boletos
      </label>
      <button
        type="button"
        className={classeBotaoPrimario}
        disabled={!podeEnviar}
        onClick={() => setConfirmar(true)}
      >
        Reenviar boletos
      </button>
      <span className="text-sm text-muted">{ajuda}</span>
      <DialogoConfirmacao
        aberto={confirmar}
        titulo="Reenviar boletos"
        descricao={textoConfirmacaoReenvio(ids.length, modoTeste, emailLogado)}
        confirmarRotulo="Reenviar"
        cancelarRotulo="Cancelar"
        enviando={enviando}
        onCancelar={() => {
          if (!enviando) setConfirmar(false);
        }}
        onConfirmar={() => void enviar()}
      >
        <p>E-mail do passo Na emissão, o mesmo de Enviar lembrete.</p>
        {foraDaPagina > 0 ? <p className="mt-2 text-muted">Inclui boletos de outras páginas desta lista.</p> : null}
      </DialogoConfirmacao>
      {resultado ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-resultado-reenvio"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-6 shadow-xl"
          >
            <h2 id="titulo-resultado-reenvio" className="font-display text-2xl text-ink">
              Reenviar boletos
            </h2>
            <div className="mt-3 space-y-1 text-sm leading-6">
              {textoResumoReenvio(resultado).map((linha) => (
                <p key={linha}>{linha}</p>
              ))}
            </div>
            {grupos.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {grupos.map((grupo) => (
                  <li key={grupo.motivo}>
                    {grupo.motivo} · {grupo.quantidade}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 flex justify-end">
              <button type="button" className={classeBotaoSecundario} onClick={() => setResultado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
