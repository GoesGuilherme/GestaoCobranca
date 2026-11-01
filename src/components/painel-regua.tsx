"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { inteiroDeCampo, textoHoraPermitido, textoInteiroPermitido } from "@/lib/inteiro-campo";
import { AMOSTRA_REGUA, textoRegua } from "@/lib/regua";
import {
  MENSAGEM_DIAS_REGUA,
  MENSAGEM_HORA_REGUA,
  MENSAGEM_JANELA_REGUA,
  montarReguaParaSalvar,
  rotuloPassoRascunho,
  textoDiasDe,
} from "@/lib/regua-rascunho";
import type { ConfiguracaoReguaDTO, ConfiguracaoTwilioDTO, ReguaDTO } from "@/lib/tipos";
import { LinhaDoTempoRegua } from "./linha-tempo-regua";
import { PainelWhatsapp } from "./painel-whatsapp";
import { AvisoModoTeste } from "./aviso-modo-teste";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

type PassoEditavel = {
  id?: string;
  naEmissao: boolean;
  dias: string;
  assunto: string;
  corpo: string;
  enviarWhatsapp: boolean;
};

type Rascunho = {
  id: string;
  nome: string;
  padrao: boolean;
  horaInicio: string;
  horaFim: string;
  enviarFimDeSemana: boolean;
  passos: PassoEditavel[];
};

function rascunhoDe(regua: ReguaDTO): Rascunho {
  return {
    id: regua.id,
    nome: regua.nome,
    padrao: regua.padrao,
    horaInicio: String(regua.horaInicio),
    horaFim: String(regua.horaFim),
    enviarFimDeSemana: regua.enviarFimDeSemana,
    passos: regua.passos.map((passo) => ({
      id: passo.id,
      naEmissao: passo.naEmissao,
      dias: textoDiasDe(passo.dias, passo.naEmissao),
      assunto: passo.assunto,
      corpo: passo.corpo,
      enviarWhatsapp: passo.enviarWhatsapp,
    })),
  };
}

function passoNovo(): PassoEditavel {
  return {
    naEmissao: false,
    dias: "0",
    assunto: "Sua cobrança vence hoje",
    corpo: "Olá, {cliente}. A cobrança de {servico}, no valor de {valor}, vence em {vencimento}: {link}",
    enviarWhatsapp: false,
  };
}

export function PainelRegua({
  podeEditar,
  nomeEmpresa,
  config,
  reguas,
  whatsapp,
}: {
  podeEditar: boolean;
  nomeEmpresa: string;
  config: ConfiguracaoReguaDTO;
  reguas: ReguaDTO[];
  whatsapp: ConfiguracaoTwilioDTO;
}) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(config.ativa);
  const [modoTeste, setModoTeste] = useState(config.modoTeste);
  const [remetenteNome, setRemetenteNome] = useState(config.remetenteNome);
  const [remetenteEmail, setRemetenteEmail] = useState(config.remetenteEmail);
  const [replyTo, setReplyTo] = useState(config.replyTo);
  const [chave, setChave] = useState("");
  const [configurada, setConfigurada] = useState(config.configurada);
  const [lista, setLista] = useState(reguas);
  const [selecionada, setSelecionada] = useState(reguas.find((regua) => regua.padrao)?.id ?? reguas[0]?.id ?? "");
  const inicial = reguas.find((regua) => regua.id === selecionada) ?? reguas[0];
  const [rascunho, setRascunho] = useState<Rascunho | null>(inicial ? rascunhoDe(inicial) : null);
  const [passoAberto, setPassoAberto] = useState(0);
  const [nomeNova, setNomeNova] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  function aplicar(painel: { config: ConfiguracaoReguaDTO; reguas: ReguaDTO[] }, manterId?: string) {
    setLista(painel.reguas);
    setAtiva(painel.config.ativa);
    setModoTeste(painel.config.modoTeste);
    setRemetenteNome(painel.config.remetenteNome);
    setRemetenteEmail(painel.config.remetenteEmail);
    setReplyTo(painel.config.replyTo);
    setConfigurada(painel.config.configurada);
    setChave("");
    const id = manterId && painel.reguas.some((regua) => regua.id === manterId)
      ? manterId
      : painel.reguas.find((regua) => regua.padrao)?.id ?? painel.reguas[0]?.id ?? "";
    setSelecionada(id);
    const regua = painel.reguas.find((item) => item.id === id);
    setRascunho(regua ? rascunhoDe(regua) : null);
    setPassoAberto(0);
  }

  function escolher(id: string) {
    setSelecionada(id);
    const regua = lista.find((item) => item.id === id);
    setRascunho(regua ? rascunhoDe(regua) : null);
    setPassoAberto(0);
  }

  async function salvarConfig(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEditar) return;
    setErro("");
    setAviso("");
    setEnviando(true);
    const resposta = await enviarJson<{ config: ConfiguracaoReguaDTO; reguas: ReguaDTO[] }>("/api/regua/config", "POST", {
      ativa,
      modoTeste,
      remetenteNome,
      remetenteEmail,
      replyTo,
      chaveResend: chave,
    });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    aplicar(resposta.dados, selecionada);
    setAviso(resposta.dados.config.ativa ? "Régua salva." : "Régua desligada.");
    router.refresh();
  }

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEditar) return;
    setErro("");
    setAviso("");
    const montado = montarReguaParaSalvar({
      nome: nomeNova,
      padrao: lista.length === 0,
      horaInicio: "8",
      horaFim: "18",
      enviarFimDeSemana: false,
      passos: [passoNovo()],
    });
    if (!montado.ok) {
      setErro(montado.mensagem);
      return;
    }
    setEnviando(true);
    const resposta = await enviarJson<{ config: ConfiguracaoReguaDTO; reguas: ReguaDTO[] }>(
      "/api/regua/reguas",
      "POST",
      montado.corpo,
    );
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    const criada = resposta.dados.reguas.find((regua) => regua.nome === nomeNova.trim());
    setNomeNova("");
    aplicar(resposta.dados, criada?.id);
    setAviso("Régua criada.");
    router.refresh();
  }

  async function salvarRegua(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeEditar || !rascunho) return;
    const montado = montarReguaParaSalvar(rascunho);
    if (!montado.ok) {
      setAviso("");
      setErro(montado.mensagem);
      return;
    }
    setErro("");
    setAviso("");
    setEnviando(true);
    const resposta = await enviarJson<{ config: ConfiguracaoReguaDTO; reguas: ReguaDTO[] }>(
      `/api/regua/reguas/${rascunho.id}`,
      "PATCH",
      montado.corpo,
    );
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    aplicar(resposta.dados, rascunho.id);
    setAviso("Passos salvos.");
    router.refresh();
  }

  async function excluir() {
    if (!podeEditar || !rascunho) return;
    setErro("");
    setAviso("");
    setEnviando(true);
    const resposta = await enviarJson<{ config: ConfiguracaoReguaDTO; reguas: ReguaDTO[] }>(
      `/api/regua/reguas/${rascunho.id}`,
      "DELETE",
    );
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    aplicar(resposta.dados);
    setAviso("Régua apagada.");
    router.refresh();
  }

  async function testarEmail() {
    if (!podeEditar) return;
    setErro("");
    setAviso("");
    setEnviando(true);
    const resposta = await enviarJson<{ enviado: boolean }>("/api/regua/teste-email", "POST");
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    setAviso("E-mail de teste enviado para o seu endereço.");
  }

  function atualizarPasso(indice: number, parcial: Partial<PassoEditavel>) {
    setRascunho((atual) => {
      if (!atual) return atual;
      const passos = atual.passos.map((passo, i) => (i === indice ? { ...passo, ...parcial } : passo));
      return { ...atual, passos };
    });
  }

  function mover(indice: number, delta: number) {
    setRascunho((atual) => {
      if (!atual) return atual;
      const destino = indice + delta;
      if (destino < 0 || destino >= atual.passos.length) return atual;
      const passos = [...atual.passos];
      const [item] = passos.splice(indice, 1);
      passos.splice(destino, 0, item);
      return { ...atual, passos };
    });
    setPassoAberto(indice + delta);
  }

  const passo = rascunho?.passos[passoAberto];
  const previa = useMemo(() => {
    if (!passo) return "";
    return textoRegua(passo.corpo, { ...AMOSTRA_REGUA, empresa: nomeEmpresa });
  }, [passo, nomeEmpresa]);
  const previaAssunto = passo ? textoRegua(passo.assunto, { ...AMOSTRA_REGUA, empresa: nomeEmpresa }) : "";

  return (
    <>
      <AvisoModoTeste ativo={modoTeste} />
      {!podeEditar ? (
        <p className="mb-6 text-sm text-muted">Só o dono altera a régua. Você pode consultar os passos.</p>
      ) : null}

      <form className="rounded-3xl border border-line bg-card p-6" onSubmit={salvarConfig}>
        <h2 className="font-display text-3xl">Envio</h2>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input id="regua-ativa" type="checkbox" checked={ativa} disabled={!podeEditar} onChange={(evento) => setAtiva(evento.target.checked)} />
            Ligar a régua desta empresa
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input id="regua-modo-teste" type="checkbox" checked={modoTeste} disabled={!podeEditar} onChange={(evento) => setModoTeste(evento.target.checked)} />
            Modo teste (não envia para o cliente)
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Campo label="Nome do remetente" htmlFor="resend-nome">
            <input id="resend-nome" className={classeCampo} value={remetenteNome} disabled={!podeEditar} onChange={(evento) => setRemetenteNome(evento.target.value)} />
          </Campo>
          <Campo label="E-mail do remetente" htmlFor="resend-email" dica="Se ficar vazio, os e-mails saem de cobranca@taguaro.com.br. O domínio precisa estar verificado na Resend.">
            <input id="resend-email" className={classeCampo} value={remetenteEmail} disabled={!podeEditar} onChange={(evento) => setRemetenteEmail(evento.target.value)} />
          </Campo>
          <Campo label="Responder para" htmlFor="resend-reply">
            <input id="resend-reply" className={classeCampo} value={replyTo} disabled={!podeEditar} onChange={(evento) => setReplyTo(evento.target.value)} />
          </Campo>
          <Campo label="Chave da Resend" htmlFor="resend-chave" dica="Fica cifrada. A tela não mostra a chave de novo.">
            <input
              id="resend-chave"
              className={classeCampo}
              type="password"
              autoComplete="new-password"
              value={chave}
              disabled={!podeEditar}
              placeholder={configurada ? "Deixe em branco para manter" : "Cole a chave"}
              onChange={(evento) => setChave(evento.target.value)}
            />
          </Campo>
        </div>
        <p id="resend-estado" className="mt-3 text-sm font-medium">
          {configurada ? "Chave configurada" : "Chave não configurada"}
        </p>
        {podeEditar ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button id="regua-salvar-config" type="submit" className={classeBotaoPrimario} disabled={enviando}>
              Salvar envio
            </button>
            <button id="regua-teste-email" type="button" className={classeBotaoSecundario} disabled={enviando} onClick={testarEmail}>
              Enviar e-mail de teste
            </button>
          </div>
        ) : null}
      </form>

      <PainelWhatsapp podeEditar={podeEditar} nomeEmpresa={nomeEmpresa} inicial={whatsapp} />

      <section className="mt-8 min-w-0 rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-3xl">Réguas</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Cada régua tem os próprios passos, o horário de envio e se sai no fim de semana. Uma é a padrão da empresa. O cliente pode usar outra, nenhuma, ou ficar pausado.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {lista.map((regua) => (
            <button
              key={regua.id}
              type="button"
              className={regua.id === selecionada ? classeBotaoPrimario : classeBotaoSecundario}
              onClick={() => escolher(regua.id)}
            >
              {regua.nome}
              {regua.padrao ? " · padrão" : ""}
            </button>
          ))}
        </div>
        {podeEditar ? (
          <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={criar}>
            <Campo label="Nova régua" htmlFor="regua-nome-nova">
              <input id="regua-nome-nova" className={classeCampo} value={nomeNova} onChange={(evento) => setNomeNova(evento.target.value)} placeholder="Nome da régua" />
            </Campo>
            <button id="regua-criar" type="submit" className={classeBotaoSecundario} disabled={enviando}>
              Adicionar régua
            </button>
          </form>
        ) : null}

        {lista.length > 0 ? (
          <div className="mt-6 grid min-w-0 gap-5">
            {lista.map((regua) => {
              const editando = regua.id === selecionada && rascunho?.id === regua.id;
              return (
                <LinhaDoTempoRegua
                  key={regua.id}
                  nome={editando && rascunho ? rascunho.nome : regua.nome}
                  passos={editando && rascunho ? rascunho.passos : regua.passos}
                  passoAberto={editando ? passoAberto : null}
                  onSelecionar={editando ? setPassoAberto : undefined}
                  ativa={editando}
                />
              );
            })}
          </div>
        ) : null}

        {rascunho ? (
          <form className="mt-6 grid gap-4" onSubmit={salvarRegua}>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Nome" htmlFor="regua-nome">
                <input id="regua-nome" className={classeCampo} value={rascunho.nome} disabled={!podeEditar} onChange={(evento) => setRascunho({ ...rascunho, nome: evento.target.value })} />
              </Campo>
              <label className="mt-7 flex items-center gap-2 text-sm">
                <input id="regua-padrao" type="checkbox" checked={rascunho.padrao} disabled={!podeEditar} onChange={(evento) => setRascunho({ ...rascunho, padrao: evento.target.checked })} />
                Régua padrão da empresa
              </label>
              <Campo
                label="Enviar a partir da hora"
                htmlFor="regua-hora-inicio"
                dica="Horário de Brasília. O envio diário sai às 9h."
                erro={erro === MENSAGEM_HORA_REGUA ? erro : undefined}
              >
                <input
                  id="regua-hora-inicio"
                  className={classeCampo}
                  inputMode="numeric"
                  value={rascunho.horaInicio}
                  disabled={!podeEditar}
                  onChange={(evento) => {
                    const texto = evento.target.value.trim();
                    if (!textoHoraPermitido(texto)) return;
                    setRascunho({ ...rascunho, horaInicio: texto });
                  }}
                  onBlur={() => {
                    const valor = inteiroDeCampo(rascunho.horaInicio);
                    if (valor !== null && valor <= 23) setRascunho({ ...rascunho, horaInicio: String(valor) });
                  }}
                />
              </Campo>
              <Campo
                label="Até antes da hora"
                htmlFor="regua-hora-fim"
                erro={erro === MENSAGEM_HORA_REGUA || erro === MENSAGEM_JANELA_REGUA ? erro : undefined}
              >
                <input
                  id="regua-hora-fim"
                  className={classeCampo}
                  inputMode="numeric"
                  value={rascunho.horaFim}
                  disabled={!podeEditar}
                  onChange={(evento) => {
                    const texto = evento.target.value.trim();
                    if (!textoHoraPermitido(texto)) return;
                    setRascunho({ ...rascunho, horaFim: texto });
                  }}
                  onBlur={() => {
                    const valor = inteiroDeCampo(rascunho.horaFim);
                    if (valor !== null && valor <= 23) setRascunho({ ...rascunho, horaFim: String(valor) });
                  }}
                />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input id="regua-fim-de-semana" type="checkbox" checked={rascunho.enviarFimDeSemana} disabled={!podeEditar} onChange={(evento) => setRascunho({ ...rascunho, enviarFimDeSemana: evento.target.checked })} />
              Enviar no fim de semana
            </label>

            <div>
              <h3 className="text-sm font-semibold">Passos</h3>
              <ul className="mt-2 space-y-2">
                {rascunho.passos.map((item, indice) => (
                  <li key={item.id ?? `novo-${indice}`} className="flex flex-wrap items-center gap-2">
                    <button type="button" className={indice === passoAberto ? classeBotaoPrimario : classeBotaoSecundario} onClick={() => setPassoAberto(indice)}>
                      {rotuloPassoRascunho(item)}
                    </button>
                    {podeEditar ? (
                      <>
                        <button type="button" className={classeBotaoSecundario} onClick={() => mover(indice, -1)}>Subir</button>
                        <button type="button" className={classeBotaoSecundario} onClick={() => mover(indice, 1)}>Descer</button>
                        <button
                          type="button"
                          className={classeBotaoPerigo}
                          onClick={() => {
                            setRascunho({ ...rascunho, passos: rascunho.passos.filter((_, i) => i !== indice) });
                            setPassoAberto(0);
                          }}
                        >
                          Remover
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              {podeEditar ? (
                <button
                  type="button"
                  className={`${classeBotaoSecundario} mt-3`}
                  onClick={() => {
                    setRascunho({ ...rascunho, passos: [...rascunho.passos, passoNovo()] });
                    setPassoAberto(rascunho.passos.length);
                  }}
                >
                  Adicionar passo
                </button>
              ) : null}
            </div>

            {passo ? (
              <div className="grid gap-4 rounded-2xl border border-line p-4 md:grid-cols-2">
                <Campo label="Quando" htmlFor="passo-tipo">
                  <select
                    id="passo-tipo"
                    className={classeCampo}
                    disabled={!podeEditar}
                    value={passo.naEmissao ? "emissao" : "dias"}
                    onChange={(evento) => {
                      const emissao = evento.target.value === "emissao";
                      atualizarPasso(passoAberto, {
                        naEmissao: emissao,
                        dias: emissao || passo.dias !== "" ? passo.dias : "0",
                      });
                    }}
                  >
                    <option value="emissao">Na emissão</option>
                    <option value="dias">Dias em relação ao vencimento</option>
                  </select>
                </Campo>
                {passo.naEmissao ? null : (
                  <Campo
                    label="Dias (negativo antes, zero no dia, positivo em atraso)"
                    htmlFor="passo-dias"
                    erro={erro === MENSAGEM_DIAS_REGUA ? erro : undefined}
                  >
                    <input
                      id="passo-dias"
                      className={classeCampo}
                      inputMode="numeric"
                      disabled={!podeEditar}
                      value={passo.dias}
                      onChange={(evento) => {
                        const texto = evento.target.value.trim();
                        if (!textoInteiroPermitido(texto)) return;
                        if (erro === MENSAGEM_DIAS_REGUA) setErro("");
                        atualizarPasso(passoAberto, { dias: texto });
                      }}
                      onBlur={() => {
                        const valor = inteiroDeCampo(passo.dias);
                        if (valor !== null) atualizarPasso(passoAberto, { dias: String(valor) });
                      }}
                    />
                  </Campo>
                )}
                <Campo label="Canal" htmlFor="passo-canal">
                  <select id="passo-canal" className={classeCampo} value="EMAIL" disabled={!podeEditar} onChange={() => undefined}>
                    <option value="EMAIL">E-mail</option>
                  </select>
                </Campo>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={passo.enviarWhatsapp}
                    disabled={!podeEditar}
                    onChange={(evento) => atualizarPasso(passoAberto, { enviarWhatsapp: evento.target.checked })}
                  />
                  Também enviar por WhatsApp, no mesmo dia deste passo
                </label>
                <Campo label="Assunto" htmlFor="passo-assunto">
                  <input id="passo-assunto" className={classeCampo} disabled={!podeEditar} value={passo.assunto} onChange={(evento) => atualizarPasso(passoAberto, { assunto: evento.target.value })} />
                </Campo>
                <div className="md:col-span-2">
                  <Campo label="Texto" htmlFor="passo-corpo" dica="Campos: {cliente} {servico} {valor} {vencimento} {link} {dias_atraso} {empresa}">
                    <textarea id="passo-corpo" className={`${classeCampo} min-h-28`} disabled={!podeEditar} value={passo.corpo} onChange={(evento) => atualizarPasso(passoAberto, { corpo: evento.target.value })} />
                  </Campo>
                </div>
                <div className="md:col-span-2 rounded-2xl bg-sand p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Prévia</p>
                  <p id="passo-preview-assunto" className="mt-2 text-sm font-medium">{previaAssunto}</p>
                  <p id="passo-preview" className="mt-2 whitespace-pre-wrap text-sm">{previa}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Esta régua ainda não tem passos.</p>
            )}

            {podeEditar ? (
              <div className="flex flex-wrap gap-2">
                <button id="regua-salvar" type="submit" className={classeBotaoPrimario} disabled={enviando}>Salvar régua</button>
                <button type="button" className={classeBotaoPerigo} disabled={enviando} onClick={excluir}>Apagar régua</button>
              </div>
            ) : null}
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">Nenhuma régua ainda. Ao ligar a régua, a empresa ganha uma sugestão chamada Padrão, que pode ser editada.</p>
        )}
      </section>

      {erro ? <p className="mt-4 text-sm text-clay">{erro}</p> : null}
      {aviso ? <p className="mt-4 text-sm text-canopy">{aviso}</p> : null}
    </>
  );
}
