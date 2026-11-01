"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import type { ConfiguracaoAssessorDTO, ConversaAssessorDTO, ConversaAssessorDetalhe } from "@/lib/tipos";
import { esquemaAssessor, esquemaRespostaAssessor, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function PainelAssessor({
  podeEditar,
  config,
  conversas,
  detalhe,
}: {
  podeEditar: boolean;
  config: ConfiguracaoAssessorDTO;
  conversas: ConversaAssessorDTO[];
  detalhe: ConversaAssessorDetalhe | null;
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(config.ativo);
  const [modoTeste, setModoTeste] = useState(config.modoTeste);
  const [nome, setNome] = useState(config.nome);
  const [tom, setTom] = useState(config.tom);
  const [promptExtra, setPromptExtra] = useState(config.promptExtra);
  const [horaInicio, setHoraInicio] = useState(String(config.horaInicio));
  const [horaFim, setHoraFim] = useState(String(config.horaFim));
  const [fimDeSemana, setFimDeSemana] = useState(config.atendeFimDeSemana);
  const [resposta, setResposta] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEditar) return;
    const entrada = {
      ativo,
      modoTeste,
      nome,
      tom,
      promptExtra,
      horaInicio: horaInicio.trim() === "" ? Number.NaN : Number(horaInicio),
      horaFim: horaFim.trim() === "" ? Number.NaN : Number(horaFim),
      atendeFimDeSemana: fimDeSemana,
    };
    const validado = esquemaAssessor.safeParse(entrada);
    if (!validado.success) {
      const mensagens = mensagensDoZod(validado.error);
      const raiz = validado.error.issues.find((issue) => issue.path.length === 0);
      if (raiz && !mensagens.horaFim) mensagens.horaFim = raiz.message;
      setCampos(mensagens);
      avisarCamposObrigatorios();
      return;
    }
    setEnviando(true);
    setCampos({});
    const resultado = await enviarJson<ConfiguracaoAssessorDTO>("/api/assessor/config", "POST", entrada);
    setEnviando(false);
    if (!resultado.ok) {
      avisarErro(resultado.erro);
      return;
    }
    avisarSucesso("Assessor salvo");
    router.refresh();
  }

  async function acao(url: string, corpo?: unknown, sucesso = "Conversa atualizada") {
    if (corpo && typeof corpo === "object" && "texto" in corpo) {
      const validado = esquemaRespostaAssessor.safeParse(corpo);
      if (!validado.success) {
        avisarCamposObrigatorios();
        return;
      }
    }
    setEnviando(true);
    const resultado = await enviarJson<ConversaAssessorDetalhe>(url, "POST", corpo);
    setEnviando(false);
    if (!resultado.ok) {
      avisarErro(resultado.erro);
      return;
    }
    if (corpo && typeof corpo === "object" && "texto" in corpo) {
      setResposta((atual) => valoresAposSalvar("criar", atual, ""));
    }
    avisarSucesso(sucesso);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={salvar} className="rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-3xl">Configuração</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Cada empresa liga o próprio assessor. Ele usa o WhatsApp desta empresa e só vê os dados dela. O modo teste começa ligado: a resposta sai só para o número em TWILIO_WHATSAPP_TESTE.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} disabled={!podeEditar} onChange={(evento) => setAtivo(evento.target.checked)} />
            Assessor ligado
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={modoTeste} disabled={!podeEditar} onChange={(evento) => setModoTeste(evento.target.checked)} />
            Modo teste
          </label>
          <Campo label="Nome do assessor" htmlFor="assessor-nome" erro={campos.nome}>
            <input id="assessor-nome" className={classeCampo} value={nome} disabled={!podeEditar} maxLength={40} onChange={(evento) => setNome(evento.target.value)} />
          </Campo>
          <Campo label="Tom" htmlFor="assessor-tom" erro={campos.tom}>
            <input id="assessor-tom" className={classeCampo} value={tom} disabled={!podeEditar} maxLength={160} onChange={(evento) => setTom(evento.target.value)} />
          </Campo>
          <Campo label="Começa às" htmlFor="assessor-inicio" erro={campos.horaInicio}>
            <input id="assessor-inicio" className={classeCampo} inputMode="numeric" value={horaInicio} disabled={!podeEditar} onChange={(evento) => setHoraInicio(evento.target.value)} />
          </Campo>
          <Campo label="Até às" htmlFor="assessor-fim" erro={campos.horaFim}>
            <input id="assessor-fim" className={classeCampo} inputMode="numeric" value={horaFim} disabled={!podeEditar} onChange={(evento) => setHoraFim(evento.target.value)} />
          </Campo>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={fimDeSemana} disabled={!podeEditar} onChange={(evento) => setFimDeSemana(evento.target.checked)} />
            Responde no fim de semana
          </label>
          <div className="md:col-span-2">
            <Campo label="Texto da empresa" htmlFor="assessor-prompt">
              <textarea
                id="assessor-prompt"
                className={`${classeCampo} min-h-28`}
                value={promptExtra}
                disabled={!podeEditar}
                maxLength={1500}
                placeholder="Nome comercial, o que a equipe prefere dizer. As regras de segurança continuam valendo."
                onChange={(evento) => setPromptExtra(evento.target.value)}
              />
            </Campo>
          </div>
        </div>
        {podeEditar ? (
          <button type="submit" className={`${classeBotaoPrimario} mt-4`} disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar assessor"}
          </button>
        ) : (
          <p className="mt-4 text-sm text-muted">Só o dono altera esta configuração. Dono e financeiro acompanham as conversas.</p>
        )}
      </form>

      <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="rounded-3xl border border-line bg-card">
          <h2 className="px-5 pt-5 font-display text-2xl">Conversas</h2>
          {conversas.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Nenhuma conversa ainda.</p> : null}
          <ul className="divide-y divide-line">
            {conversas.map((conversa) => (
              <li key={conversa.id}>
                <Link href={`/assessor?conversa=${conversa.id}`} className="block px-5 py-4 hover:bg-sand">
                  <p className="font-medium">{conversa.nomeCliente ?? conversa.telefone}</p>
                  <p className="mt-1 text-sm text-muted">
                    {conversa.telefone}
                    {conversa.iaPausada ? " · IA pausada" : " · IA ativa"}
                    {conversa.pedidosAbertos > 0 ? ` · ${conversa.pedidosAbertos} pedido` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-line bg-card p-5">
          {detalhe ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl">{detalhe.nomeCliente ?? "Telefone não reconhecido"}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {detalhe.telefone} · {detalhe.janelaAberta ? "janela de 24h aberta" : "janela encerrada, sem texto livre"}
                    {detalhe.iaPausada ? " · você assumiu" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {detalhe.iaPausada ? (
                    <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void acao(`/api/assessor/conversas/${detalhe.id}/devolver`)}>
                      Devolver à IA
                    </button>
                  ) : (
                    <button type="button" className={classeBotaoPrimario} disabled={enviando} onClick={() => void acao(`/api/assessor/conversas/${detalhe.id}/assumir`)}>
                      Assumir
                    </button>
                  )}
                </div>
              </div>
              {detalhe.pedidos.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {detalhe.pedidos.map((pedido) => (
                    <li key={pedido.id} className="rounded-2xl bg-sand px-4 py-3 text-sm">
                      {pedido.motivo} · {pedido.status}. {pedido.resumo}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ol className="mt-4 space-y-3">
                {detalhe.mensagens.map((mensagem) => (
                  <li
                    key={mensagem.id}
                    className={`max-w-[40rem] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      mensagem.papel === "CLIENTE"
                        ? "bg-paper"
                        : mensagem.papel === "SISTEMA"
                          ? "bg-transparent text-muted"
                          : "ml-auto bg-forest-deep text-paper"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wide opacity-70">{mensagem.papel === "HUMANO" ? "Equipe" : mensagem.papel === "ASSESSOR" ? "Assessor" : mensagem.papel === "SISTEMA" ? "Sistema" : "Cliente"}</p>
                    <p className="mt-1 whitespace-pre-wrap">{mensagem.corpo}</p>
                  </li>
                ))}
              </ol>
              <form
                className="mt-4 flex flex-col gap-3"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void acao(`/api/assessor/conversas/${detalhe.id}/responder`, { texto: resposta }, "Resposta enviada");
                }}
              >
                <textarea
                  className={`${classeCampo} min-h-24`}
                  value={resposta}
                  maxLength={1000}
                  disabled={!detalhe.janelaAberta}
                  placeholder={detalhe.janelaAberta ? "Responder como a equipe. A IA fica pausada." : "A janela de 24h encerrou. Não há texto livre."}
                  onChange={(evento) => setResposta(evento.target.value)}
                />
                <button type="submit" className={classeBotaoPrimario} disabled={enviando || !detalhe.janelaAberta || resposta.trim().length === 0}>
                  Enviar resposta
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted">Escolha uma conversa para ler o histórico, assumir o atendimento ou responder dentro da janela de 24 horas.</p>
          )}
        </div>
      </section>
    </div>
  );
}
