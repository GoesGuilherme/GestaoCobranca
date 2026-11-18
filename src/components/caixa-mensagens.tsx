"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  filtrosCaixaAtivos,
  gruposPorDia,
  horaSaoPaulo,
  horarioListaConversa,
  iniciaisDoNome,
  legendaDaBolha,
  urlCaixaMensagens,
  type BolhaConversa,
  type ConversaMensagens,
  type ResumoConversa,
  type TickMensagem,
} from "@/lib/caixa-mensagens";
import { CANAIS_MENSAGEM, PERIODOS_MENSAGEM, STATUS_MENSAGEM } from "@/lib/mensagens-twilio";
import { classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { FormularioRespostaWhatsapp } from "./formulario-resposta-whatsapp";
import { avisarErro } from "./notificador";

type FiltroTela = {
  periodo: string;
  de: string;
  ate: string;
  status: string;
  canal: string;
  clienteId: string;
  busca: string;
};

type ClienteOpcao = { id: string; nomeFantasia: string };

function paramsDoFiltro(filtro: FiltroTela, extra: { conversa?: string } = {}): Record<string, string | undefined> {
  return {
    periodo: filtro.periodo === "todos" ? undefined : filtro.periodo,
    de: filtro.periodo === "personalizado" ? filtro.de : undefined,
    ate: filtro.periodo === "personalizado" ? filtro.ate : undefined,
    status: filtro.status,
    canal: filtro.canal,
    cliente: filtro.clienteId,
    q: filtro.busca,
    conversa: extra.conversa,
  };
}

function AvatarConversa({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fotoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-forest text-sm font-semibold text-paper">
      {iniciaisDoNome(nome)}
    </span>
  );
}

function Tiques({ ticks }: { ticks: TickMensagem | null }) {
  if (ticks === "lida") {
    return (
      <span className="text-[#8ec5ff]" aria-label="Lida">
        ✓✓
      </span>
    );
  }
  if (ticks === "entregue") {
    return <span aria-label="Entregue">✓✓</span>;
  }
  if (ticks === "enviada") {
    return <span aria-label="Enviada">✓</span>;
  }
  if (ticks === "fila") {
    return <span aria-label="Na fila">◷</span>;
  }
  if (ticks === "falha" || ticks === "nao_enviada") {
    return <span className="text-clay" aria-label={ticks === "falha" ? "Falha" : "Não enviada"}>●</span>;
  }
  return null;
}

function Bolha({ bolha }: { bolha: BolhaConversa }) {
  const empresa = bolha.lado === "empresa";
  const legenda = legendaDaBolha(bolha);
  const falha = bolha.ticks === "falha" || bolha.ticks === "nao_enviada";
  return (
    <li className={`flex ${empresa ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[min(100%,34rem)] ${empresa ? "items-end" : "items-start"} flex flex-col`}>
        {legenda || bolha.cobrancaId ? (
          <p className={`mb-1 px-1 text-[11px] leading-4 text-muted ${empresa ? "text-right" : ""}`}>
            {legenda}
            {legenda && bolha.cobrancaId ? " · " : null}
            {bolha.cobrancaId ? (
              <Link href={`/faturas/${bolha.cobrancaId}`} className="text-canopy hover:underline">
                {bolha.cobranca}
              </Link>
            ) : null}
            {bolha.modoTeste ? " · Modo teste" : null}
          </p>
        ) : null}
        <div
          className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
            empresa ? "rounded-br-md bg-forest text-paper" : "rounded-bl-md border border-line bg-card text-ink"
          } ${falha ? "ring-1 ring-clay/50" : ""}`}
        >
          <p className="whitespace-pre-wrap leading-6">{bolha.texto}</p>
          <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${empresa ? "text-white/75" : "text-muted"}`}>
            <time dateTime={bolha.quando}>{horaSaoPaulo(bolha.quando)}</time>
            {empresa ? <Tiques ticks={bolha.ticks} /> : null}
          </p>
        </div>
        {falha ? (
          <p className="mt-1 max-w-sm px-1 text-xs font-medium text-clay">{bolha.motivo || "Falha no envio"}</p>
        ) : null}
      </div>
    </li>
  );
}

export function CaixaMensagens({
  filtro,
  clientes,
  conversasIniciais,
  cursorInicial,
  conversa,
  agoraIso,
}: {
  filtro: FiltroTela;
  clientes: ClienteOpcao[];
  conversasIniciais: ResumoConversa[];
  cursorInicial: string | null;
  conversa: ConversaMensagens | null;
  agoraIso: string;
}) {
  const router = useRouter();
  const agora = new Date(agoraIso);
  const [conversas, setConversas] = useState(conversasIniciais);
  const [cursorLista, setCursorLista] = useState(cursorInicial);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const carregandoListaRef = useRef(false);
  const [bolhas, setBolhas] = useState(conversa?.bolhas ?? []);
  const [cursorMensagens, setCursorMensagens] = useState(conversa?.proximoCursor ?? null);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const carregandoMensagensRef = useRef(false);
  const painelRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const telefoneAberto = conversa?.telefone ?? "";
  const assinaturaLista = `${cursorInicial ?? ""}|${conversasIniciais.map((item) => `${item.telefone}:${item.naoLidas}:${item.ultimaEm}`).join("|")}`;
  const ativos = filtrosCaixaAtivos({
    periodo: filtro.periodo,
    status: filtro.status,
    canal: filtro.canal,
    clienteId: filtro.clienteId,
  });
  const consultaLista = urlCaixaMensagens(paramsDoFiltro(filtro)).replace("/mensagens", "");
  const hrefConversa = (telefone: string) => urlCaixaMensagens(paramsDoFiltro(filtro, { conversa: telefone }));
  const hrefLista = urlCaixaMensagens(paramsDoFiltro(filtro));

  useEffect(() => {
    setConversas(conversasIniciais);
    setCursorLista(cursorInicial);
  }, [assinaturaLista, conversasIniciais, cursorInicial]);

  useEffect(() => {
    setBolhas(conversa?.bolhas ?? []);
    setCursorMensagens(conversa?.proximoCursor ?? null);
  }, [telefoneAberto, conversa]);

  useEffect(() => {
    const painel = painelRef.current;
    if (!painel) return;
    painel.scrollTop = painel.scrollHeight;
  }, [telefoneAberto]);

  async function carregarConversas() {
    if (!cursorLista || carregandoListaRef.current) return;
    carregandoListaRef.current = true;
    setCarregandoLista(true);
    try {
      const url = `/api/mensagens/caixa${consultaLista}${consultaLista ? "&" : "?"}cursor=${encodeURIComponent(cursorLista)}`;
      const resposta = await fetch(url);
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
        avisarErro(corpo.erro ?? "Não foi possível carregar mais conversas.");
        return;
      }
      const dados = (await resposta.json()) as { conversas: ResumoConversa[]; proximoCursor: string | null };
      setConversas((atual) => {
        const vistos = new Set(atual.map((item) => item.telefone));
        return [...atual, ...dados.conversas.filter((item) => !vistos.has(item.telefone))];
      });
      setCursorLista(dados.proximoCursor);
    } catch {
      avisarErro("Não foi possível carregar mais conversas.");
    } finally {
      carregandoListaRef.current = false;
      setCarregandoLista(false);
    }
  }

  async function carregarMensagensAntigas() {
    if (!conversa || !cursorMensagens || carregandoMensagensRef.current) return;
    carregandoMensagensRef.current = true;
    const painel = painelRef.current;
    const alturaAntes = painel?.scrollHeight ?? 0;
    setCarregandoMensagens(true);
    try {
      const base = new URLSearchParams(consultaLista.replace(/^\?/, ""));
      base.set("conversa", conversa.telefone);
      base.set("antes", cursorMensagens);
      const resposta = await fetch(`/api/mensagens/historico?${base.toString()}`);
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
        avisarErro(corpo.erro ?? "Não foi possível carregar mensagens anteriores.");
        return;
      }
      const dados = (await resposta.json()) as { bolhas: BolhaConversa[]; proximoCursor: string | null };
      setBolhas((atual) => {
        const vistos = new Set(atual.map((item) => item.id));
        return [...dados.bolhas.filter((item) => !vistos.has(item.id)), ...atual];
      });
      setCursorMensagens(dados.proximoCursor);
      requestAnimationFrame(() => {
        if (!painel) return;
        painel.scrollTop = painel.scrollHeight - alturaAntes;
      });
    } catch {
      avisarErro("Não foi possível carregar mensagens anteriores.");
    } finally {
      carregandoMensagensRef.current = false;
      setCarregandoMensagens(false);
    }
  }

  function aoRolarLista() {
    const el = listaRef.current;
    if (!el || !cursorLista) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) void carregarConversas();
  }

  function aoRolarMensagens() {
    const el = painelRef.current;
    if (!el || !cursorMensagens) return;
    if (el.scrollTop < 48) void carregarMensagensAntigas();
  }

  const grupos = gruposPorDia(bolhas, agora);
  const aberta = Boolean(conversa);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100svh-17rem)] min-h-[24rem] overflow-hidden border-y border-line bg-card md:-mx-8 md:-my-10 md:h-dvh md:min-h-0 md:rounded-none">
      <section
        className={`${aberta ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-line md:w-[22.5rem] md:max-w-[40%] md:border-r`}
        aria-label="Conversas"
      >
        <header className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl text-ink">Mensagens</h1>
            <details className="relative">
              <summary className={`${classeBotaoSecundario} min-h-10 cursor-pointer list-none px-3 marker:hidden [&::-webkit-details-marker]:hidden`}>
                Filtros{ativos > 0 ? ` (${ativos})` : ""}
              </summary>
              <form method="get" className="absolute right-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-2xl border border-line bg-card p-4 shadow-xl">
                {filtro.busca ? <input type="hidden" name="q" value={filtro.busca} /> : null}
                {conversa ? <input type="hidden" name="conversa" value={conversa.telefone} /> : null}
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Período</span>
                  <select name="periodo" defaultValue={filtro.periodo} className={classeCampo}>
                    {PERIODOS_MENSAGEM.map((item) => (
                      <option key={item.valor} value={item.valor}>
                        {item.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">De</span>
                    <input type="date" name="de" defaultValue={filtro.de} className={classeCampo} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Até</span>
                    <input type="date" name="ate" defaultValue={filtro.ate} className={classeCampo} />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select name="status" defaultValue={filtro.status} className={classeCampo}>
                    <option value="">Todos</option>
                    {STATUS_MENSAGEM.map((item) => (
                      <option key={item.valor} value={item.valor}>
                        {item.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Canal</span>
                  <select name="canal" defaultValue={filtro.canal} className={classeCampo}>
                    <option value="">Todos</option>
                    {CANAIS_MENSAGEM.map((item) => (
                      <option key={item.valor} value={item.valor}>
                        {item.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Cliente</span>
                  <select name="cliente" defaultValue={filtro.clienteId} className={classeCampo}>
                    <option value="">Todos</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nomeFantasia}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className={classeBotaoPrimario}>
                    Aplicar
                  </button>
                  <Link href={conversa ? `/mensagens?conversa=${encodeURIComponent(conversa.telefone)}` : "/mensagens"} className={classeBotaoSecundario}>
                    Limpar
                  </Link>
                </div>
              </form>
            </details>
          </div>
          <p className="mt-1 text-xs text-muted">Horário de Brasília. Cada empresa vê só as próprias mensagens.</p>
          <form method="get" className="mt-3 flex gap-2">
            {filtro.periodo !== "todos" ? <input type="hidden" name="periodo" value={filtro.periodo} /> : null}
            {filtro.de && filtro.periodo === "personalizado" ? <input type="hidden" name="de" value={filtro.de} /> : null}
            {filtro.ate && filtro.periodo === "personalizado" ? <input type="hidden" name="ate" value={filtro.ate} /> : null}
            {filtro.status ? <input type="hidden" name="status" value={filtro.status} /> : null}
            {filtro.canal ? <input type="hidden" name="canal" value={filtro.canal} /> : null}
            {filtro.clienteId ? <input type="hidden" name="cliente" value={filtro.clienteId} /> : null}
            {conversa ? <input type="hidden" name="conversa" value={conversa.telefone} /> : null}
            <label className="min-w-0 flex-1">
              <span className="sr-only">Busca</span>
              <input
                type="search"
                name="q"
                defaultValue={filtro.busca}
                placeholder="Cliente, cobrança, identificador ou telefone"
                className={classeCampo}
              />
            </label>
            <button type="submit" className={classeBotaoPrimario}>
              Buscar
            </button>
          </form>
        </header>
        <div ref={listaRef} onScroll={aoRolarLista} className="min-h-0 flex-1 overflow-y-auto">
          {conversas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Nenhuma conversa neste filtro.</p>
          ) : (
            <ul>
              {conversas.map((item) => {
                const ativa = item.telefone === telefoneAberto;
                return (
                  <li key={item.telefone} className="border-b border-line">
                    <Link
                      href={hrefConversa(item.telefone)}
                      aria-current={ativa ? "page" : undefined}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-sand/70 ${ativa ? "bg-gold-soft/70" : ""}`}
                    >
                      <AvatarConversa nome={item.nomes} fotoUrl={item.fotoUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate ${item.naoLidas > 0 ? "font-semibold" : "font-medium"}`}>{item.nomes}</span>
                          <time className="shrink-0 text-xs text-muted" dateTime={item.ultimaEm}>
                            {horarioListaConversa(item.ultimaEm, agora)}
                          </time>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-muted">
                            {item.canal === "SMS" ? "SMS · " : ""}
                            {item.previa}
                          </span>
                          {item.naoLidas > 0 ? (
                            <span className="grid min-w-6 place-items-center rounded-full bg-gold px-1.5 text-xs font-semibold text-forest-deep">
                              {item.naoLidas > 99 ? "99+" : item.naoLidas}
                              <span className="sr-only">{item.naoLidas === 1 ? " mensagem não lida" : " mensagens não lidas"}</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {cursorLista ? (
            <div className="px-4 py-3">
              <button type="button" className={classeBotaoSecundario} onClick={() => void carregarConversas()} disabled={carregandoLista}>
                {carregandoLista ? "Carregando..." : "Carregar conversas anteriores"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className={`${aberta ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-paper`} aria-label="Conversa">
        {conversa ? (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-card px-3 py-3 md:px-5">
              <Link href={hrefLista} className={`${classeBotaoSecundario} min-h-10 px-3 md:hidden`}>
                Voltar
              </Link>
              <AvatarConversa nome={conversa.clientes.map((cliente) => cliente.nome).join(", ") || "Número sem cadastro"} fotoUrl={null} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl">
                  {conversa.clientes.map((cliente) => cliente.nome).join(", ") || "Número sem cadastro"}
                </h2>
                <p className="truncate text-sm text-muted">{conversa.telefoneExibicao}</p>
                {conversa.clientes.length > 0 ? (
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm">
                    {conversa.clientes.map((cliente) => (
                      <Link key={cliente.id} href={`/clientes/${cliente.id}#faturas`} className="text-canopy hover:underline">
                        Faturas de {cliente.nome}
                      </Link>
                    ))}
                  </p>
                ) : null}
              </div>
            </header>
            <div ref={painelRef} onScroll={aoRolarMensagens} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6" aria-label="Histórico da conversa">
              {cursorMensagens ? (
                <div className="mb-3 flex justify-center">
                  <button type="button" className={classeBotaoSecundario} onClick={() => void carregarMensagensAntigas()} disabled={carregandoMensagens}>
                    {carregandoMensagens ? "Carregando..." : "Carregar mensagens anteriores"}
                  </button>
                </div>
              ) : null}
              {grupos.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma mensagem neste filtro.</p>
              ) : (
                <ol className="grid gap-3">
                  {grupos.map((grupo) => (
                    <li key={grupo.rotulo}>
                      <div className="mb-3 flex justify-center">
                        <span className="rounded-full bg-sand px-3 py-1 text-xs font-medium text-muted">{grupo.rotulo}</span>
                      </div>
                      <ol className="grid gap-2">
                        {grupo.itens.map((bolha) => (
                          <Bolha key={bolha.id} bolha={bolha} />
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="border-t border-line bg-card px-3 py-3 md:px-5">
              <FormularioRespostaWhatsapp telefone={conversa.telefone} bloqueado={!conversa.janelaAberta} aviso={conversa.aviso} />
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <p className="font-display text-2xl text-forest">Escolha uma conversa</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                As mensagens da régua, os envios manuais, os modelos e as respostas do cliente aparecem aqui. O SMS continua na mesma conversa.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
