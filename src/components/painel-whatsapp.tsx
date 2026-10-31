"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import type { ConfiguracaoTwilioDTO } from "@/lib/tipos";
import { Aviso } from "./aviso";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

const ROTULO: Record<string, string> = {
  BOLETO_GERADO: "Boleto gerado",
  VENCE_EM_DIAS: "Vence em X dias",
  VENCEU: "Venceu",
  PAGO: "Pago",
};

function rotuloTemplate(status: string) {
  const mapa: Record<string, string> = {
    approved: "aprovado",
    APPROVED: "aprovado",
    pending: "pendente",
    PENDING: "pendente",
    rejected: "recusado",
    REJECTED: "recusado",
    paused: "pausado",
    PAUSED: "pausado",
  };
  return mapa[status] ?? status;
}

const COEXISTENCIA: Record<ConfiguracaoTwilioDTO["coexistencia"], string> = {
  NAO_SOLICITADA: "Não pedida",
  SOLICITADA: "Pedida; a API ainda não confirmou",
  ATIVA: "Ativa",
  INDISPONIVEL: "Indisponível nesta conta",
};

export function PainelWhatsapp({
  podeEditar,
  nomeEmpresa,
  inicial,
}: {
  podeEditar: boolean;
  nomeEmpresa: string;
  inicial: ConfiguracaoTwilioDTO;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [telefone, setTelefone] = useState(inicial.senderTelefone ?? "");
  const [nome, setNome] = useState(inicial.nomeExibicao || nomeEmpresa);
  const [wabaId, setWabaId] = useState(inicial.wabaId ?? "");
  const [coexistencia, setCoexistencia] = useState(inicial.coexistencia !== "NAO_SOLICITADA");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  function aplicar(proximo: ConfiguracaoTwilioDTO, texto: string) {
    setEstado(proximo);
    setTelefone(proximo.senderTelefone ?? telefone);
    setNome(proximo.nomeExibicao || nome);
    setWabaId(proximo.wabaId ?? "");
    setCoexistencia(proximo.coexistencia !== "NAO_SOLICITADA");
    setAviso(texto);
    setErro(proximo.erro ?? "");
  }

  async function enviar(url: string, corpo: unknown, sucesso: string) {
    if (!podeEditar) return;
    setEnviando(true);
    setErro("");
    setAviso("");
    const resposta = await enviarJson<ConfiguracaoTwilioDTO>(url, "POST", corpo);
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    aplicar(resposta.dados, sucesso);
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-3xl">WhatsApp</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        Cada empresa ganha uma subconta e um Sender na Twilio. O e-mail continua pela Resend. O WhatsApp sai no mesmo passo, se estiver marcado, usando template UTILITY. No modo teste nada vai para o cliente.
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estado.senderStatus === "ONLINE" ? "bg-leaf text-ok" : estado.senderStatus ? "bg-gold-soft text-gold-ink" : "bg-sand text-ink"}`} title={estado.senderStatus ?? "não conectado"}>
          {estado.senderStatus === "ONLINE" ? "WhatsApp conectado" : estado.senderStatus === "OFFLINE" ? "WhatsApp desconectado" : estado.senderStatus ? `WhatsApp: ${estado.senderStatus}` : "WhatsApp não conectado"}
        </span>
        {estado.tokenMascarado ? <span className="text-muted">Token {estado.tokenMascarado}</span> : null}
      </p>
      <p className="mt-1 text-sm">Coexistência: {COEXISTENCIA[estado.coexistencia]}</p>
      {estado.templates.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {estado.templates.map((template) => (
            <li key={template.tipo}>
              {ROTULO[template.tipo] ?? template.nome}: {rotuloTemplate(template.status)}
              {template.motivo ? ` · ${template.motivo}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Os quatro templates (boleto gerado, vence em X dias, venceu e pago) são criados na conexão.</p>
      )}
      {podeEditar ? (
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            void enviar("/api/regua/whatsapp", { telefone, nomeExibicao: nome, wabaId, coexistencia }, "WhatsApp salvo.");
          }}
        >
          <Campo label="WhatsApp do remetente" htmlFor="twilio-telefone" dica="O número que a Twilio usa para enviar. Pode incluir o código do país, como +55 11 98888-0000.">
            <input id="twilio-telefone" className={classeCampo} inputMode="tel" autoComplete="tel" value={telefone} onChange={(evento) => setTelefone(evento.target.value)} />
          </Campo>
          <Campo label="Nome no WhatsApp" htmlFor="twilio-nome">
            <input id="twilio-nome" className={classeCampo} value={nome} onChange={(evento) => setNome(evento.target.value)} />
          </Campo>
          <Campo label="WABA ID (se a Twilio já tiver passado)" htmlFor="twilio-waba">
            <input id="twilio-waba" className={classeCampo} value={wabaId} onChange={(evento) => setWabaId(evento.target.value)} />
          </Campo>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={coexistencia} onChange={(evento) => setCoexistencia(evento.target.checked)} />
            Pedir coexistência com o app WhatsApp Business, se a Twilio oferecer
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
              {estado.conectada ? "Atualizar Sender" : "Conectar Twilio"}
            </button>
            <button
              type="button"
              className={classeBotaoSecundario}
              disabled={enviando || !estado.conectada}
              onClick={() => void enviar("/api/regua/whatsapp/atualizar", {}, "Status atualizado.")}
            >
              Atualizar status
            </button>
          </div>
        </form>
      ) : null}
      {podeEditar && estado.conectada && estado.senderStatus !== "ONLINE" ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void enviar("/api/regua/whatsapp/codigo", { codigo }, "Código enviado à Twilio.");
          }}
        >
          <Campo label="Código de verificação" htmlFor="twilio-codigo">
            <input id="twilio-codigo" className={classeCampo} inputMode="numeric" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} />
          </Campo>
          <button type="submit" className={classeBotaoSecundario} disabled={enviando}>
            Confirmar código
          </button>
        </form>
      ) : null}
      {erro ? (
        <div className="mt-3">
          <Aviso tom="erro" titulo={erro} onFechar={() => setErro("")} />
        </div>
      ) : null}
      {aviso && !erro ? (
        <div className="mt-3">
          <Aviso tom="ok" titulo={aviso} onFechar={() => setAviso("")} />
        </div>
      ) : null}
    </section>
  );
}
