"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import type { ConfiguracaoTwilioDTO } from "@/lib/tipos";
import { descreverCanalWhatsapp } from "@/lib/whatsapp-canal";
import { esquemaCodigoTwilio, esquemaConexaoTwilio, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

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
  modoTeste,
}: {
  podeEditar: boolean;
  nomeEmpresa: string;
  inicial: ConfiguracaoTwilioDTO;
  modoTeste: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [telefone, setTelefone] = useState(inicial.senderTelefone ?? "");
  const [nome, setNome] = useState(inicial.nomeExibicao || nomeEmpresa);
  const [wabaId, setWabaId] = useState(inicial.wabaId ?? "");
  const [coexistencia, setCoexistencia] = useState(inicial.coexistencia !== "NAO_SOLICITADA");
  const [codigo, setCodigo] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function aplicar(proximo: ConfiguracaoTwilioDTO, texto: string) {
    setEstado(proximo);
    setTelefone(proximo.senderTelefone ?? telefone);
    setNome(proximo.nomeExibicao || nome);
    setWabaId(proximo.wabaId ?? "");
    setCoexistencia(proximo.coexistencia !== "NAO_SOLICITADA");
    setCampos({});
    avisarSucesso(texto);
    if (proximo.erro) avisarErro(proximo.erro);
  }

  async function enviar(url: string, corpo: unknown, sucesso: string): Promise<boolean> {
    if (!podeEditar) return false;
    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson<ConfiguracaoTwilioDTO>(url, "POST", corpo);
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return false;
      }
      avisarErro(resposta.erro);
      return false;
    }
    aplicar(resposta.dados, sucesso);
    router.refresh();
    return true;
  }

  const numeroEmpresaPronto =
    estado.senderStatus === "ONLINE" &&
    Boolean(estado.senderTelefone) &&
    estado.templates.some((template) => template.status === "APROVADO");
  const canal = descreverCanalWhatsapp({
    modoTeste,
    remetenteOficialLigado: estado.canal.remetenteOficialLigado,
    sandboxLigado: estado.canal.sandboxLigado,
    numeroTesteConfigurado: estado.canal.numeroTesteConfigurado,
    templatesContaPaiProntos: estado.canal.templatesContaPaiProntos,
    numeroEmpresaPronto,
    producaoOficialLiberada: estado.canal.producaoOficialLiberada,
  });

  return (
    <section id="whatsapp" className="mt-6 scroll-mt-24 rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-3xl">WhatsApp</h2>
      <p className="mt-3">
        <span className="inline-flex rounded-full bg-sand px-2.5 py-1 text-xs font-semibold text-ink">{canal.selo}</span>
      </p>
      {canal.paragrafos.map((paragrafo) => (
        <p key={paragrafo} className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          {paragrafo}
        </p>
      ))}
      <details className="mt-6 rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium">Número próprio da empresa (em breve)</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{canal.notaNumeroProprio}</p>
        {estado.conectada ? (
          <p className="mt-3 text-sm">
            Número guardado: {estado.senderStatus ?? "sem status"}
            {estado.senderTelefone ? ` · ${estado.senderTelefone}` : ""}.
            {canal.usaNumeroEmpresa ? " É este número que envia no estado acima." : " Ele não é o remetente descrito acima."}
          </p>
        ) : null}
        {estado.tokenMascarado ? <p className="mt-1 text-sm text-muted">Token {estado.tokenMascarado}</p> : null}
        <p className="mt-2 text-sm">Coexistência: {COEXISTENCIA[estado.coexistencia]}</p>
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
          <p className="mt-3 text-sm text-muted">
            Os templates do número da empresa (boleto gerado, vence em X dias, venceu e pago) só são criados se esta conexão for usada.
          </p>
        )}
        {podeEditar ? (
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            const validado = esquemaConexaoTwilio.safeParse({ telefone, nomeExibicao: nome, wabaId, coexistencia });
            if (!validado.success) {
              setCampos(mensagensDoZod(validado.error));
              avisarCamposObrigatorios();
              return;
            }
            void enviar("/api/regua/whatsapp", { telefone, nomeExibicao: nome, wabaId, coexistencia }, "WhatsApp salvo");
          }}
        >
          <Campo label="WhatsApp do remetente" htmlFor="twilio-telefone" erro={campos.telefone} dica="O número que a Twilio usa para enviar. Pode incluir o código do país, como +55 11 98888-0000.">
            <input id="twilio-telefone" className={classeCampo} inputMode="tel" autoComplete="tel" value={telefone} onChange={(evento) => setTelefone(evento.target.value)} />
          </Campo>
          <Campo label="Nome no WhatsApp" htmlFor="twilio-nome" erro={campos.nomeExibicao}>
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
            <button type="submit" className={classeBotaoSecundario} disabled={enviando}>
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
            void (async () => {
            const validado = esquemaCodigoTwilio.safeParse({ codigo });
            if (!validado.success) {
              setCampos(mensagensDoZod(validado.error));
              avisarCamposObrigatorios();
              return;
            }
            const ok = await enviar("/api/regua/whatsapp/codigo", { codigo }, "Código enviado");
            if (ok) setCodigo((atual) => valoresAposSalvar("criar", atual, ""));
            })();
          }}
        >
          <Campo label="Código de verificação" htmlFor="twilio-codigo" erro={campos.codigo}>
            <input id="twilio-codigo" className={classeCampo} inputMode="numeric" value={codigo} onChange={(evento) => setCodigo(evento.target.value)} />
          </Campo>
          <button type="submit" className={classeBotaoSecundario} disabled={enviando}>
            Confirmar código
          </button>
        </form>
      ) : null}
      </details>
    </section>
  );
}
