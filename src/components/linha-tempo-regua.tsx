"use client";

import { Check, Mail } from "lucide-react";
import { useState } from "react";
import {
  COR_FASE_LINHA_TEMPO,
  marcadoresDaLinhaTempo,
  nomeAcaoLinhaTempo,
  type FaseLinhaTempo,
  type PassoLinhaTempo,
} from "@/lib/linha-tempo-regua";

function IconeWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.52 3.48A11.8 11.8 0 0 0 12.06 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.75 1.47h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.43-8.44zM12.06 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.74.98 1-3.64-.22-.37a9.35 9.35 0 0 1-1.44-5.01c0-5.18 4.22-9.4 9.42-9.4 2.51 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.75 6.65c0 5.18-4.22 9.4-9.4 9.54zm5.16-7.05c-.28-.14-1.67-.82-1.93-.92-.26-.1-.45-.14-.64.14-.19.28-.73.92-.9 1.11-.16.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.16.19-.28.28-.47.1-.19.05-.35-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.35-.26.28-1 1-1 2.43s1.03 2.82 1.17 3.01c.14.19 2.03 3.1 4.92 4.35.69.3 1.22.47 1.64.6.69.22 1.32.19 1.81.11.55-.08 1.67-.68 1.9-1.34.24-.66.24-1.22.17-1.34-.07-.12-.26-.19-.54-.33z" />
    </svg>
  );
}

function degrade(atual: FaseLinhaTempo, proxima: FaseLinhaTempo): string {
  const da = COR_FASE_LINHA_TEMPO[atual].marca;
  const ate = COR_FASE_LINHA_TEMPO[proxima].marca;
  return `linear-gradient(90deg, ${da}, ${ate})`;
}

export function LinhaDoTempoRegua({
  nome,
  descricao,
  passos,
  passoAberto = null,
  onSelecionar,
  ativa = false,
}: {
  nome: string;
  descricao?: string | null;
  passos: PassoLinhaTempo[];
  passoAberto?: number | null;
  onSelecionar?: (indice: number) => void;
  ativa?: boolean;
}) {
  const [marcoAtivo, setMarcoAtivo] = useState<string | null>(null);
  const marcadores = marcadoresDaLinhaTempo(passos);
  const temPasso = marcadores.some((marcador) => marcador.fase !== "pago");
  const titulo = nome.trim() || "Régua sem nome";
  const dicaAtiva = marcadores.find((marcador) => marcador.chave === marcoAtivo)?.dica ?? null;

  function mostrar(chave: string) {
    setMarcoAtivo(chave);
  }

  function esconder(elemento: HTMLElement, chave: string) {
    if (elemento === document.activeElement) return;
    setMarcoAtivo((atual) => (atual === chave ? null : atual));
  }

  return (
    <section
      id={ativa ? "linha-tempo-regua" : undefined}
      aria-label={`Linha do tempo de ${titulo}`}
      className={`min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border px-4 py-8 sm:px-8 ${
        ativa ? "border-[#0E3A6B]/30 bg-white shadow-[0_18px_40px_-28px_rgba(14,58,107,0.7)]" : "border-line bg-white"
      }`}
    >
      <h3 className="text-center font-display text-2xl font-semibold tracking-tight text-[#0E3A6B] sm:text-3xl">{titulo}</h3>
      {descricao?.trim() ? (
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted">{descricao.trim()}</p>
      ) : null}

      {temPasso ? (
        <div className="mt-8 max-w-full overflow-x-auto overscroll-x-contain pb-1">
          <div className="flex w-max min-w-full justify-center">
            <ol className="flex items-start">
              {marcadores.map((marcador, posicao) => {
                const cor = COR_FASE_LINHA_TEMPO[marcador.fase];
                const proximo = marcadores[posicao + 1];
                const selecionado = marcador.indice !== null && marcador.indice === passoAberto;
                const circulo = marcador.fase === "pago" || marcador.texto.length <= 1;
                const abrePasso = marcador.indice !== null && Boolean(onSelecionar);
                return (
                  <li key={marcador.chave} className="w-36 shrink-0 sm:w-[9.5rem]">
                    <div className="relative flex h-12 w-full items-center justify-center">
                      {proximo ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 left-1/2 h-1 w-full -translate-y-1/2"
                          style={{ background: degrade(marcador.fase, proximo.fase) }}
                        />
                      ) : null}
                      <button
                        type="button"
                        className={`relative z-10 inline-flex h-12 items-center justify-center rounded-full text-base font-semibold tabular-nums transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${circulo ? "w-12" : "min-w-12 px-3.5"} ${abrePasso ? "cursor-pointer" : "cursor-default"}`}
                        style={{
                          backgroundColor: cor.marca,
                          color: cor.texto,
                          boxShadow: selecionado ? `0 0 0 2px #ffffff, 0 0 0 4px ${cor.marca}` : undefined,
                        }}
                        title={marcador.dica}
                        aria-label={`${nomeAcaoLinhaTempo(marcador.fase)}. ${marcador.dica}`}
                        aria-current={selecionado ? "step" : undefined}
                        onMouseEnter={() => mostrar(marcador.chave)}
                        onMouseLeave={(evento) => esconder(evento.currentTarget, marcador.chave)}
                        onFocus={() => mostrar(marcador.chave)}
                        onBlur={(evento) => esconder(evento.currentTarget, marcador.chave)}
                        onClick={() => {
                          if (marcador.indice !== null) onSelecionar?.(marcador.indice);
                        }}
                      >
                        {marcador.fase === "pago" ? <Check className="size-6" strokeWidth={2.75} aria-hidden /> : marcador.texto}
                      </button>
                    </div>
                    <p className="mt-3 min-h-10 px-1.5 text-center text-[13px] font-semibold leading-snug" style={{ color: cor.apoio }}>
                      {nomeAcaoLinhaTempo(marcador.fase)}
                    </p>
                    {marcador.assunto.trim() && marcador.assunto.trim() !== nomeAcaoLinhaTempo(marcador.fase) ? (
                      <p className="mt-1 px-1.5 text-center text-[13px] leading-snug text-muted">{marcador.assunto.trim()}</p>
                    ) : null}
                    <div className="mt-1.5 flex h-5 items-center justify-center gap-1.5" style={{ color: cor.apoio }}>
                      {marcador.canais.includes("email") ? <Mail className="size-5" strokeWidth={1.75} aria-hidden /> : null}
                      {marcador.canais.includes("whatsapp") ? <IconeWhatsapp className="size-5" /> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-muted">Adicione passos para ver a linha do tempo.</p>
      )}

      {temPasso ? (
        <p className={`mx-auto mt-6 line-clamp-2 min-h-10 max-w-xl text-center text-sm ${dicaAtiva ? "font-medium text-ink" : "text-muted"}`}>
          {dicaAtiva ?? "Passe o cursor sobre um marco para ver o dia, o canal e o modelo."}
        </p>
      ) : null}
    </section>
  );
}
