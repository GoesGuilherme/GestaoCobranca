"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import type { PainelTelefonesDTO, TemplateTelefoneDTO } from "@/lib/tipos";
import { chipsDoTipo, rotuloChipTemplate, validarCorpoTemplate, type ChipTemplate } from "@/lib/template-whatsapp-editor";
import { TITULO_BOTAO_PROMESSA } from "@/lib/whatsapp-promessa";
import { classeBotaoPrimario, classeBotaoSecundario, classeCampo } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

function EditorModelo({
  modelo,
  promessaWhatsapp,
  podeEnviarModelo,
  promessaPendente,
}: {
  modelo: TemplateTelefoneDTO;
  promessaWhatsapp: boolean;
  podeEnviarModelo: boolean;
  promessaPendente: boolean;
}) {
  const router = useRouter();
  const campo = useRef<HTMLTextAreaElement>(null);
  const [corpo, setCorpo] = useState(modelo.corpo);
  const [ocupado, setOcupado] = useState<"salvar" | "enviar" | null>(null);
  const comBotao = promessaWhatsapp && modelo.tipo !== "PAGO";
  const validado = validarCorpoTemplate(modelo.tipo, corpo, comBotao);
  const mudou = corpo.trim() !== modelo.corpo.trim();
  const jaSubmetido = modelo.status === "APROVADO" || modelo.status === "ENVIADO_APROVACAO";
  const podeSalvar = mudou && ocupado === null;
  const podeEnviar = ocupado === null && podeEnviarModelo && !promessaPendente && validado.ok && (mudou || !jaSubmetido);

  useEffect(() => {
    setCorpo(modelo.corpo);
  }, [modelo.corpo, modelo.status, modelo.motivo]);

  function inserir(chip: ChipTemplate) {
    const token = `{${chip}}`;
    const el = campo.current;
    if (!el) {
      setCorpo((atual) => `${atual} ${token}`.trim());
      return;
    }
    const inicio = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? inicio;
    const proximo = `${corpo.slice(0, inicio)}${token}${corpo.slice(fim)}`;
    setCorpo(proximo);
    const posicao = inicio + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(posicao, posicao);
    });
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeSalvar) return;
    setOcupado("salvar");
    const resposta = await enviarJson("/api/telefones/templates/texto", "POST", { tipo: modelo.tipo, corpo });
    setOcupado(null);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Texto do modelo salvo");
    router.refresh();
  }

  async function enviar() {
    if (!podeEnviar) return;
    setOcupado("enviar");
    const resposta = await enviarJson("/api/telefones/templates/aprovacao", "POST", { tipo: modelo.tipo, corpo });
    setOcupado(null);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Modelo enviado para aprovação");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-medium text-ink">{modelo.rotulo}</h3>
        <p className="text-sm text-muted">{modelo.statusRotulo}</p>
      </div>
      {modelo.motivo ? <p className="text-sm leading-6 text-clay">{modelo.motivo}</p> : null}
      <div className="flex flex-wrap gap-2">
        {chipsDoTipo(modelo.tipo).map((chip) => (
          <button
            key={chip}
            type="button"
            className={classeBotaoSecundario}
            onClick={() => inserir(chip)}
          >
            {rotuloChipTemplate(chip)}
          </button>
        ))}
      </div>
      <label className="block text-sm font-medium text-ink" htmlFor={`corpo-${modelo.tipo}`}>
        Texto
        <textarea
          ref={campo}
          id={`corpo-${modelo.tipo}`}
          name={`corpo-${modelo.tipo}`}
          value={corpo}
          onChange={(evento) => setCorpo(evento.target.value)}
          rows={5}
          className={`${classeCampo} mt-1 min-h-28`}
        />
      </label>
      {validado.ok ? null : <p className="text-sm leading-6 text-clay">{validado.mensagem}</p>}
      {comBotao ? (
        <p className="text-sm leading-6 text-muted">Botão: {TITULO_BOTAO_PROMESSA}</p>
      ) : (
        <p className="text-sm leading-6 text-muted">Este modelo sai sem o botão de promessa.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={classeBotaoPrimario} disabled={!podeSalvar}>
          {ocupado === "salvar" ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" className={classeBotaoSecundario} disabled={!podeEnviar} onClick={() => void enviar()}>
          {ocupado === "enviar" ? "Enviando..." : "Enviar para aprovação"}
        </button>
      </div>
    </form>
  );
}

export function FormularioModelosWhatsapp({
  inicial,
}: {
  inicial: Pick<PainelTelefonesDTO, "templates" | "promessaWhatsapp" | "podeEnviarModelo" | "marca">;
}) {
  const router = useRouter();
  const [ligada, setLigada] = useState(inicial.promessaWhatsapp);
  const [salvando, setSalvando] = useState(false);
  const podeSalvarPromessa = ligada !== inicial.promessaWhatsapp && !salvando;

  useEffect(() => {
    setLigada(inicial.promessaWhatsapp);
  }, [inicial.promessaWhatsapp]);

  async function salvarPromessa(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeSalvarPromessa) return;
    setSalvando(true);
    const resposta = await enviarJson("/api/telefones/promessa", "PATCH", { ligada });
    setSalvando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(ligada ? "Promessa pelo WhatsApp ligada" : "Promessa pelo WhatsApp desligada");
    router.refresh();
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Textos dos modelos</h2>
      <p className="text-sm leading-6 text-muted">
        O texto começa pelo padrão da {inicial.marca}. Use os campos para nome, valor, vencimento e link. Enviar para
        aprovação cria o modelo na conta desta empresa e não manda mensagem. O envio da cobrança só usa o modelo depois
        que ele estiver aprovado.
      </p>
      {inicial.podeEnviarModelo ? null : (
        <p className="text-sm leading-6 text-ink">Vincule a conta de envio antes de mandar o modelo para aprovação.</p>
      )}
      <form onSubmit={(evento) => void salvarPromessa(evento)} className="space-y-3">
        <label className="flex items-start gap-3 text-sm text-ink" htmlFor="promessa-whatsapp">
          <input
            id="promessa-whatsapp"
            type="checkbox"
            className="mt-1 size-4"
            checked={ligada}
            onChange={(evento) => setLigada(evento.target.checked)}
          />
          <span>Permitir promessa pelo WhatsApp</span>
        </label>
        <button type="submit" className={classeBotaoPrimario} disabled={!podeSalvarPromessa}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
      {inicial.templates.map((modelo) => (
        <EditorModelo
          key={modelo.tipo}
          modelo={modelo}
          promessaWhatsapp={ligada}
          podeEnviarModelo={inicial.podeEnviarModelo}
          promessaPendente={ligada !== inicial.promessaWhatsapp}
        />
      ))}
    </section>
  );
}
